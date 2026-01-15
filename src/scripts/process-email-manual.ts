/**
 * Script para procesar emails manualmente (sin el agente)
 * Procesa TODOS los adjuntos de TODOS los emails pendientes
 * Flujo: Gmail -> Textract -> DB
 * 
 * ⚡ PROCESAMIENTO EN PARALELO para mejor performance
 */

import { getGmailService, EmailMessage, EmailAttachment } from '../services/gmail.service';
import { getTextractService } from '../services/textract.service';
import { getDatabaseService } from '../services/database.service';

// Configuración de paralelismo
const MAX_CONCURRENT = 3; // Máximo de documentos procesándose en paralelo

interface ProcessResult {
  success: boolean;
  fileName: string;
  documentId?: string;
  error?: string;
  duration?: number;
}

async function processAttachment(
  email: EmailMessage,
  attachment: EmailAttachment,
  textractService: ReturnType<typeof getTextractService>,
  dbService: ReturnType<typeof getDatabaseService>,
  index: number
): Promise<ProcessResult> {
  const startTime = Date.now();
  const prefix = `[${index}]`;
  
  try {
    console.log(`${prefix} 📄 Iniciando: ${attachment.filename} (${(attachment.size / 1024).toFixed(1)} KB)`);

    // Enviar a Textract
    const extractionResult = await textractService.analyzeDocumentAsync(
      attachment.data,
      attachment.filename,
      attachment.mimeType
    );
    
    // Guardar en base de datos
    const document = await dbService.saveExtractedDocument({
      emailId: email.id,
      emailSubject: email.subject,
      emailFrom: email.from,
      emailDate: email.date,
      fileName: attachment.filename,
      fileType: attachment.mimeType,
      extractionResult,
    });
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`${prefix} ✅ Completado: ${attachment.filename} (${duration}s) - ${extractionResult.keyValuePairs.length} campos, ${extractionResult.tables.length} tablas`);
    
    return {
      success: true,
      fileName: attachment.filename,
      documentId: document.id,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`${prefix} ❌ Error: ${attachment.filename} (${duration}s) - ${errorMessage}`);
    return {
      success: false,
      fileName: attachment.filename,
      error: errorMessage,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Procesa un array de promesas con límite de concurrencia
 */
async function processWithConcurrency<T>(
  items: T[],
  processor: (item: T, index: number) => Promise<ProcessResult>,
  maxConcurrent: number
): Promise<ProcessResult[]> {
  const results: ProcessResult[] = [];
  const executing: Promise<void>[] = [];
  
  for (let i = 0; i < items.length; i++) {
    const promise = processor(items[i], i + 1).then(result => {
      results.push(result);
    });
    
    executing.push(promise);
    
    // Si alcanzamos el límite, esperamos que termine uno
    if (executing.length >= maxConcurrent) {
      await Promise.race(executing);
      // Limpiar promesas completadas
      const completed = executing.filter(p => {
        // Check if promise is settled
        let settled = false;
        p.then(() => { settled = true; }).catch(() => { settled = true; });
        return settled;
      });
      executing.length = 0;
      executing.push(...executing.filter(p => !completed.includes(p)));
    }
  }
  
  // Esperar las promesas restantes
  await Promise.all(executing);
  
  return results;
}

async function main() {
  const totalStartTime = Date.now();
  
  console.log('========================================');
  console.log('  Procesamiento Manual de Emails');
  console.log('  ⚡ MODO PARALELO (máx ' + MAX_CONCURRENT + ' simultáneos)');
  console.log('========================================\n');

  const gmailService = getGmailService();
  const textractService = getTextractService();
  const dbService = getDatabaseService();

  let allResults: ProcessResult[] = [];
  
  try {
    // 1. Obtener todos los emails con adjuntos
    console.log('🔍 Buscando emails con adjuntos...');
    const emails = await gmailService.getUnreadEmailsWithAttachments();
    
    if (emails.length === 0) {
      console.log('   No hay emails para procesar.');
      return;
    }

    // Contar total de adjuntos
    const totalAttachments = emails.reduce((sum, e) => sum + e.attachments.length, 0);
    console.log(`✓ Encontrados: ${emails.length} email(s) con ${totalAttachments} adjunto(s)\n`);

    // 2. Procesar cada email
    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      const emailStartTime = Date.now();
      
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📧 Email ${i + 1}/${emails.length}: ${email.subject}`);
      console.log(`   De: ${email.from}`);
      console.log(`   Adjuntos: ${email.attachments.length} (procesando ${Math.min(email.attachments.length, MAX_CONCURRENT)} en paralelo)`);
      console.log('='.repeat(60) + '\n');

      // ⚡ PROCESAR EN PARALELO todos los adjuntos del email
      const emailResults = await Promise.all(
        email.attachments.map((attachment, idx) => 
          processAttachment(email, attachment, textractService, dbService, idx + 1)
        )
      );
      
      allResults = [...allResults, ...emailResults];
      
      const emailDuration = ((Date.now() - emailStartTime) / 1000).toFixed(1);
      const successCount = emailResults.filter(r => r.success).length;
      
      console.log(`\n   ⏱️  Email procesado en ${emailDuration}s (${successCount}/${emailResults.length} exitosos)`);

      // Solo marcar como procesado si se procesaron todos los adjuntos exitosamente
      const allSuccess = emailResults.every(r => r.success);
      
      if (allSuccess) {
        console.log('   ✉️ Marcando email como procesado...');
        await dbService.markEmailProcessed(email.id);
        await gmailService.markAsRead(email.id);
        console.log('   ✓ Email marcado como leído');
      } else {
        console.log('   ⚠️ Algunos adjuntos fallaron - email NO marcado como leído');
      }
    }

    // 3. Resumen final
    const successful = allResults.filter(r => r.success);
    const failed = allResults.filter(r => !r.success);
    const totalDuration = ((Date.now() - totalStartTime) / 1000).toFixed(1);
    const avgDuration = successful.length > 0 
      ? (successful.reduce((sum, r) => sum + (r.duration || 0), 0) / successful.length / 1000).toFixed(1)
      : '0';

    console.log('\n\n' + '='.repeat(60));
    console.log('  📊 RESUMEN FINAL');
    console.log('='.repeat(60));
    console.log(`  Emails procesados: ${emails.length}`);
    console.log(`  Total adjuntos: ${allResults.length}`);
    console.log(`  ✅ Exitosos: ${successful.length}`);
    console.log(`  ❌ Fallidos: ${failed.length}`);
    console.log(`  ⏱️  Tiempo total: ${totalDuration}s`);
    console.log(`  ⚡ Tiempo promedio por documento: ${avgDuration}s`);
    
    if (successful.length > 0) {
      console.log('\n  Documentos guardados:');
      for (const r of successful) {
        console.log(`    • ${r.fileName} (ID: ${r.documentId}) - ${((r.duration || 0) / 1000).toFixed(1)}s`);
      }
    }
    
    if (failed.length > 0) {
      console.log('\n  Errores:');
      for (const r of failed) {
        console.log(`    • ${r.fileName}: ${r.error}`);
      }
    }

  } catch (error) {
    console.error('\n❌ Error general:', error);
  } finally {
    await dbService.disconnect();
  }
}

main().catch(console.error);
