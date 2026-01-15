/**
 * Test script for AWS SES email sending
 * Run with: npx ts-node src/scripts/test-ses.ts
 */

import { config, validateConfig } from '../config';
import { getEmailNotificationService } from '../services/email.service';

async function testSES() {
  console.log('========================================');
  console.log('  AWS SES Email Test');
  console.log('========================================\n');

  // Check configuration
  console.log('Configuration:');
  console.log(`  Provider: ${config.email.provider}`);
  console.log(`  From: ${config.email.fromEmail}`);
  console.log(`  To: ${config.email.notificationEmail}`);
  console.log(`  SES Region: ${config.email.ses.region}`);
  console.log();

  if (!config.email.fromEmail) {
    console.error('❌ EMAIL_FROM is not set in .env');
    console.log('\nAdd this to your .env file:');
    console.log('  EMAIL_FROM="your-verified-email@example.com"');
    process.exit(1);
  }

  if (!config.email.notificationEmail) {
    console.error('❌ NOTIFICATION_EMAIL is not set in .env');
    console.log('\nAdd this to your .env file:');
    console.log('  NOTIFICATION_EMAIL="destination@example.com"');
    process.exit(1);
  }

  // Initialize email service
  const emailService = getEmailNotificationService();

  // Verify connection
  console.log('Verifying email configuration...');
  const isValid = await emailService.verifyConnection();
  
  if (!isValid) {
    console.error('❌ Email configuration verification failed');
    process.exit(1);
  }
  console.log('✓ Email configuration verified\n');

  // Send test email
  console.log('Sending test email...');
  
  try {
    await emailService.sendExtractionNotification({
      emailId: 'test-email-id',
      emailSubject: 'Test Email - Document Extraction POC',
      emailFrom: 'test@example.com',
      fileName: 'test-document.pdf',
      extractionResult: {
        rawText: 'This is a test email to verify AWS SES configuration.\n\nIf you received this, the email notifications are working correctly!',
        keyValuePairs: [
          { key: 'Test Field 1', value: 'Test Value 1', confidence: 99.5 },
          { key: 'Amount', value: '$1,234.56', confidence: 98.2 },
          { key: 'Date', value: '2024-01-15', confidence: 97.8 },
        ],
        tables: [
          {
            rows: [
              ['Header 1', 'Header 2', 'Header 3'],
              ['Row 1 Col 1', 'Row 1 Col 2', 'Row 1 Col 3'],
              ['Row 2 Col 1', 'Row 2 Col 2', 'Row 2 Col 3'],
            ],
            confidence: 95.0,
          },
        ],
        averageConfidence: 97.6,
      },
    });

    console.log('✓ Test email sent successfully!');
    console.log(`\nCheck your inbox at: ${config.email.notificationEmail}`);
  } catch (error: any) {
    console.error('❌ Failed to send test email:', error.message);
    
    if (error.message?.includes('Email address is not verified')) {
      console.log('\n📧 You need to verify your email addresses in AWS SES:');
      console.log('   1. Go to AWS Console > SES > Verified identities');
      console.log(`   2. Verify: ${config.email.fromEmail}`);
      console.log(`   3. Verify: ${config.email.notificationEmail}`);
      console.log('   4. Check your inbox and click the verification link');
      console.log('   5. Run this test again');
    }
    
    process.exit(1);
  }
}

testSES().catch(console.error);
