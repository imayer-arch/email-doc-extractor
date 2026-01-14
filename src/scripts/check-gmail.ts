/**
 * Script para verificar la conexión con Gmail
 */

import { config } from '../config';
import { getGmailService } from '../services/gmail.service';

async function main() {
  console.log('========================================');
  console.log('  Verificando conexión con Gmail');
  console.log('========================================\n');

  console.log('Email configurado:', config.gmail.userEmail || '(no configurado)');
  console.log();

  try {
    const gmailService = getGmailService();
    
    console.log('Buscando emails no leídos con adjuntos...\n');
    
    const emails = await gmailService.getUnreadEmailsWithAttachments();
    
    if (emails.length === 0) {
      console.log('❌ No se encontraron emails no leídos con adjuntos.');
      console.log('\nPosibles causas:');
      console.log('  1. El email todavía no llegó (esperá 1-2 minutos)');
      console.log('  2. El email ya fue marcado como leído');
      console.log('  3. El email no tiene adjuntos soportados (PDF, PNG, JPG)');
      console.log('\nSolución: Marcá el email como "no leído" en Gmail y volvé a ejecutar.');
    } else {
      console.log(`✓ Se encontraron ${emails.length} email(s):\n`);
      
      for (const email of emails) {
        console.log(`📧 Email ID: ${email.id}`);
        console.log(`   Asunto: ${email.subject}`);
        console.log(`   De: ${email.from}`);
        console.log(`   Fecha: ${email.date.toLocaleString()}`);
        console.log(`   Adjuntos: ${email.attachments.length}`);
        
        for (const att of email.attachments) {
          console.log(`     - ${att.filename} (${att.mimeType}, ${(att.size / 1024).toFixed(1)} KB)`);
        }
        console.log();
      }
    }
  } catch (error) {
    console.error('❌ Error conectando con Gmail:', error);
  }
}

main().catch(console.error);
