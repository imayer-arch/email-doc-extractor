/**
 * Script para procesar un email manualmente (sin el agente)
 * Esto prueba el flujo completo: Gmail -> Textract -> DB
 */

import { getGmailService } from '../services/gmail.service';
import { getTextractService } from '../services/textract.service';
import { getDatabaseService } from '../services/database.service';

async function main() {
  console.log('========================================');
  console.log('  Procesamiento Manual de Email');
  console.log('========================================\n');

  const gmailService = getGmailService();
  const textractService = getTextractService();
  const dbService = getDatabaseService();

  try {
    // 1. Obtener emails
    console.log('1️⃣ Buscando emails con adjuntos...');
    const emails = await gmailService.getUnreadEmailsWithAttachments();
    
    if (emails.length === 0) {
      console.log('   No hay emails para procesar.');
      return;
    }

    console.log(`   ✓ Encontrado: ${emails[0].subject}\n`);

    const email = emails[0];
    const attachment = email.attachments[0];

    console.log(`2️⃣ Procesando adjunto: ${attachment.filename}`);
    console.log(`   Tamaño: ${(attachment.size / 1024).toFixed(1)} KB`);
    console.log(`   Tipo: ${attachment.mimeType}\n`);

    // 2. Enviar a Textract (usando API asíncrona para multi-página)
    console.log('3️⃣ Enviando a AWS Textract (async)...');
    const extractionResult = await textractService.analyzeDocumentAsync(
      attachment.data,
      attachment.filename,
      attachment.mimeType
    );
    
    console.log(`   ✓ Extracción completada!`);
    console.log(`   - Texto: ${extractionResult.rawText.length} caracteres`);
    console.log(`   - Pares clave-valor: ${extractionResult.keyValuePairs.length}`);
    console.log(`   - Tablas: ${extractionResult.tables.length}`);
    console.log(`   - Confianza promedio: ${extractionResult.averageConfidence.toFixed(1)}%\n`);

    // 3. Mostrar datos extraídos
    if (extractionResult.keyValuePairs.length > 0) {
      console.log('📋 Datos extraídos (Key-Value):');
      console.log('   ' + '-'.repeat(50));
      for (const kv of extractionResult.keyValuePairs.slice(0, 10)) {
        console.log(`   ${kv.key}: ${kv.value} (${kv.confidence.toFixed(0)}%)`);
      }
      if (extractionResult.keyValuePairs.length > 10) {
        console.log(`   ... y ${extractionResult.keyValuePairs.length - 10} más`);
      }
      console.log();
    }

    if (extractionResult.tables.length > 0) {
      console.log('📊 Tablas extraídas:');
      for (let i = 0; i < extractionResult.tables.length; i++) {
        const table = extractionResult.tables[i];
        console.log(`   Tabla ${i + 1} (${table.rows.length} filas, ${table.confidence.toFixed(0)}% confianza):`);
        for (const row of table.rows.slice(0, 5)) {
          console.log(`     | ${row.join(' | ')} |`);
        }
        if (table.rows.length > 5) {
          console.log(`     ... y ${table.rows.length - 5} filas más`);
        }
      }
      console.log();
    }

    // 4. Guardar en base de datos
    console.log('4️⃣ Guardando en base de datos...');
    const document = await dbService.saveExtractedDocument({
      emailId: email.id,
      emailSubject: email.subject,
      emailFrom: email.from,
      emailDate: email.date,
      fileName: attachment.filename,
      fileType: attachment.mimeType,
      extractionResult,
    });
    console.log(`   ✓ Guardado con ID: ${document.id}\n`);

    // 5. Marcar email como procesado
    console.log('5️⃣ Marcando email como procesado...');
    await dbService.markEmailProcessed(email.id);
    await gmailService.markAsRead(email.id);
    console.log('   ✓ Email marcado como leído\n');

    // Resumen
    console.log('========================================');
    console.log('  ✅ PROCESAMIENTO COMPLETADO');
    console.log('========================================');
    console.log(`  Archivo: ${attachment.filename}`);
    console.log(`  Texto extraído: ${extractionResult.rawText.substring(0, 100)}...`);
    console.log(`  Guardado en DB con ID: ${document.id}`);

  } catch (error) {
    console.error('\n❌ Error durante el procesamiento:', error);
  } finally {
    await dbService.disconnect();
  }
}

main().catch(console.error);
