/**
 * Script para procesar emails manualmente (sin el agente)
 * Procesa TODOS los adjuntos de TODOS los emails pendientes
 * Flujo: Gmail -> Textract -> DB
 */

import { getGmailService, EmailMessage, EmailAttachment } from '../services/gmail.service';
import { getTextractService } from '../services/textract.service';
import { getDatabaseService } from '../services/database.service';

interface ProcessResult {
  success: boolean;
  fileName: string;
  documentId?: string;
  error?: string;
}

async function processAttachment(
  email: EmailMessage,
  attachment: EmailAttachment,
  textractService: ReturnType<typeof getTextractService>,
  dbService: ReturnType<typeof getDatabaseService>
): Promise<ProcessResult> {
  try {
    console.log(`\n   📄 Procesando: ${attachment.filename}`);
    console.log(`      Tamaño: ${(attachment.size / 1024).toFixed(1)} KB`);
    console.log(`      Tipo: ${attachment.mimeType}`);

    // Enviar a Textract
    console.log('      ⏳ Extrayendo con Textract...');
    const extractionResult = await textractService.analyzeDocumentAsync(
      attachment.data,
      attachment.filename,
      attachment.mimeType
    );
    
    console.log(`      ✓ Texto: ${extractionResult.rawText.length} chars`);
    console.log(`      ✓ Key-Values: ${extractionResult.keyValuePairs.length}`);
    console.log(`      ✓ Tablas: ${extractionResult.tables.length}`);
    console.log(`      ✓ Confianza: ${extractionResult.averageConfidence.toFixed(1)}%`);

    // Guardar en base de datos
    console.log('      💾 Guardando en BD...');
    const document = await dbService.saveExtractedDocument({
      emailId: email.id,
      emailSubject: email.subject,
      emailFrom: email.from,
      emailDate: email.date,
      fileName: attachment.filename,
      fileType: attachment.mimeType,
      extractionResult,
    });
    
    console.log(`      ✅ Guardado con ID: ${document.id}`);
    
    return {
      success: true,
      fileName: attachment.filename,
      documentId: document.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`      ❌ Error: ${errorMessage}`);
    return {
      success: false,
      fileName: attachment.filename,
      error: errorMessage,
    };
  }
}

async function main() {
  console.log('========================================');
  console.log('  Procesamiento Manual de Emails');
  console.log('  (Todos los adjuntos)');
  console.log('========================================\n');

  const gmailService = getGmailService();
  const textractService = getTextractService();
  const dbService = getDatabaseService();

  const allResults: ProcessResult[] = [];
  
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

    // 2. Procesar cada email y todos sus adjuntos
    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      console.log(`\n${'='.repeat(50)}`);
      console.log(`📧 Email ${i + 1}/${emails.length}: ${email.subject}`);
      console.log(`   De: ${email.from}`);
      console.log(`   Adjuntos: ${email.attachments.length}`);
      console.log('='.repeat(50));

      // Procesar TODOS los adjuntos del email
      for (let j = 0; j < email.attachments.length; j++) {
        const attachment = email.attachments[j];
        console.log(`\n   [${j + 1}/${email.attachments.length}]`);
        
        const result = await processAttachment(email, attachment, textractService, dbService);
        allResults.push(result);
        
        // Pequeña pausa entre adjuntos para no saturar Textract
        if (j < email.attachments.length - 1) {
          console.log('      ⏸️  Pausa de 2s...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Solo marcar como procesado si se procesaron todos los adjuntos exitosamente
      const emailResults = allResults.filter(r => 
        email.attachments.some(a => a.filename === r.fileName)
      );
      const allSuccess = emailResults.every(r => r.success);
      
      if (allSuccess) {
        console.log('\n   ✉️ Marcando email como procesado...');
        await dbService.markEmailProcessed(email.id);
        await gmailService.markAsRead(email.id);
        console.log('   ✓ Email marcado como leído');
      } else {
        console.log('\n   ⚠️ Algunos adjuntos fallaron - email NO marcado como leído');
      }
    }

    // 3. Resumen final
    const successful = allResults.filter(r => r.success);
    const failed = allResults.filter(r => !r.success);

    console.log('\n\n' + '='.repeat(50));
    console.log('  📊 RESUMEN FINAL');
    console.log('='.repeat(50));
    console.log(`  Emails procesados: ${emails.length}`);
    console.log(`  Total adjuntos: ${allResults.length}`);
    console.log(`  ✅ Exitosos: ${successful.length}`);
    console.log(`  ❌ Fallidos: ${failed.length}`);
    
    if (successful.length > 0) {
      console.log('\n  Documentos guardados:');
      for (const r of successful) {
        console.log(`    • ${r.fileName} (ID: ${r.documentId})`);
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
