/**
 * Script para debuggear Textract
 */

import { config } from '../config';
import { getGmailService } from '../services/gmail.service';
import { 
  TextractClient, 
  DetectDocumentTextCommand,
  AnalyzeDocumentCommand,
  FeatureType 
} from '@aws-sdk/client-textract';

async function main() {
  console.log('========================================');
  console.log('  Debug Textract');
  console.log('========================================\n');

  // Verificar configuración AWS
  console.log('Configuración AWS:');
  console.log(`  Region: ${config.aws.region}`);
  console.log(`  Access Key: ${config.aws.accessKeyId.substring(0, 8)}...`);
  console.log();

  // Crear cliente
  const client = new TextractClient({
    region: config.aws.region,
    credentials: {
      accessKeyId: config.aws.accessKeyId,
      secretAccessKey: config.aws.secretAccessKey,
    },
  });

  // Obtener el documento
  const gmailService = getGmailService();
  const emails = await gmailService.getUnreadEmailsWithAttachments();
  
  if (emails.length === 0) {
    console.log('No hay emails para procesar.');
    return;
  }

  const attachment = emails[0].attachments[0];
  console.log(`Documento: ${attachment.filename}`);
  console.log(`Tamaño: ${attachment.data.length} bytes (${(attachment.data.length / 1024).toFixed(1)} KB)`);
  console.log(`MIME Type: ${attachment.mimeType}`);
  
  // Verificar primeros bytes (magic numbers)
  const header = attachment.data.slice(0, 10).toString('hex');
  console.log(`Primeros bytes (hex): ${header}`);
  
  // PDF debería empezar con 25504446 (%PDF)
  if (header.startsWith('255044462d')) {
    console.log('✓ Archivo identificado como PDF válido');
  } else {
    console.log('⚠ No parece ser un PDF estándar');
  }
  console.log();

  // Intentar con una imagen de prueba simple (crear un pequeño PNG)
  console.log('Probando conexión con Textract usando imagen de prueba...');
  
  // Crear una imagen PNG mínima con texto (1x1 pixel blanco)
  // En su lugar, probemos directamente con el documento
  
  console.log('\nIntentando DetectDocumentText...');
  try {
    const command = new DetectDocumentTextCommand({
      Document: {
        Bytes: attachment.data,
      },
    });
    
    const response = await client.send(command);
    console.log('✓ DetectDocumentText exitoso!');
    console.log(`  Bloques encontrados: ${response.Blocks?.length || 0}`);
    
    const lines = response.Blocks?.filter(b => b.BlockType === 'LINE') || [];
    console.log(`  Líneas de texto: ${lines.length}`);
    
    if (lines.length > 0) {
      console.log('\n  Primeras líneas:');
      for (const line of lines.slice(0, 5)) {
        console.log(`    - ${line.Text}`);
      }
    }
  } catch (error: any) {
    console.log(`✗ Error: ${error.message}`);
    console.log(`  Tipo: ${error.name || error.__type}`);
    console.log(`  Código HTTP: ${error.$metadata?.httpStatusCode}`);
    
    if (error.__type === 'UnsupportedDocumentException') {
      console.log('\n  Posibles causas:');
      console.log('  1. PDF tiene múltiples páginas (usar API asíncrona)');
      console.log('  2. PDF está encriptado o protegido');
      console.log('  3. PDF tiene formato interno no soportado');
      console.log('  4. Archivo corrupto');
    }
  }
}

main().catch(console.error);
