/**
 * Backend Server - Express API
 * Expone endpoints para que el frontend pueda llamar
 */

import express from 'express';
import cors from 'cors';
import { getGmailService, EmailMessage, EmailAttachment } from './services/gmail.service';
import { getTextractService } from './services/textract.service';
import { getDatabaseService } from './services/database.service';
import { config } from './config';

const app = express();
const PORT = process.env.BACKEND_PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Check for emails with attachments
app.get('/api/emails', async (req, res) => {
  try {
    const gmailService = getGmailService();
    const emails = await gmailService.getUnreadEmailsWithAttachments();
    
    res.json({
      success: true,
      count: emails.length,
      emails: emails.map(e => ({
        id: e.id,
        subject: e.subject,
        from: e.from,
        date: e.date,
        attachments: e.attachments.map(a => ({
          filename: a.filename,
          mimeType: a.mimeType,
          size: a.size,
        })),
      })),
    });
  } catch (error) {
    console.error('Error checking emails:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Process all pending emails
app.post('/api/process', async (req, res) => {
  console.log('\n========================================');
  console.log('  Processing emails via API');
  console.log('========================================\n');

  const gmailService = getGmailService();
  const textractService = getTextractService();
  const dbService = getDatabaseService();

  const results: Array<{
    success: boolean;
    fileName: string;
    documentId?: string;
    error?: string;
  }> = [];

  try {
    // Get emails
    console.log('🔍 Fetching emails...');
    const emails = await gmailService.getUnreadEmailsWithAttachments();
    
    if (emails.length === 0) {
      return res.json({
        success: true,
        message: 'No hay emails pendientes',
        emailsProcessed: 0,
        documentsProcessed: 0,
        results: [],
      });
    }

    const totalAttachments = emails.reduce((sum, e) => sum + e.attachments.length, 0);
    console.log(`✓ Found ${emails.length} email(s) with ${totalAttachments} attachment(s)\n`);

    // Process each email
    for (const email of emails) {
      console.log(`📧 Processing: ${email.subject}`);
      
      // Process each attachment
      for (const attachment of email.attachments) {
        try {
          console.log(`   📄 ${attachment.filename}...`);
          
          // Extract with Textract
          const extractionResult = await textractService.analyzeDocumentAsync(
            attachment.data,
            attachment.filename,
            attachment.mimeType
          );
          
          // Save to database
          const document = await dbService.saveExtractedDocument({
            emailId: email.id,
            emailSubject: email.subject,
            emailFrom: email.from,
            emailDate: email.date,
            fileName: attachment.filename,
            fileType: attachment.mimeType,
            extractionResult,
          });
          
          console.log(`   ✅ Saved with ID: ${document.id}`);
          
          results.push({
            success: true,
            fileName: attachment.filename,
            documentId: document.id,
          });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          console.error(`   ❌ Error: ${errorMsg}`);
          results.push({
            success: false,
            fileName: attachment.filename,
            error: errorMsg,
          });
        }
      }

      // Mark email as processed if all attachments succeeded
      const emailResults = results.filter(r => 
        email.attachments.some(a => a.filename === r.fileName)
      );
      if (emailResults.every(r => r.success)) {
        await dbService.markEmailProcessed(email.id);
        await gmailService.markAsRead(email.id);
        console.log(`   ✉️ Email marked as read\n`);
      }
    }

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log('\n========================================');
    console.log(`  ✅ Completed: ${successful.length} success, ${failed.length} failed`);
    console.log('========================================\n');

    res.json({
      success: true,
      message: 'Procesamiento completado',
      emailsProcessed: emails.length,
      documentsProcessed: results.length,
      successful: successful.length,
      failed: failed.length,
      results,
    });

  } catch (error) {
    console.error('❌ Process error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      results,
    });
  }
});

// Get stats
app.get('/api/stats', async (req, res) => {
  try {
    const dbService = getDatabaseService();
    const stats = await dbService.getExtractionStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Get documents
app.get('/api/documents', async (req, res) => {
  try {
    const dbService = getDatabaseService();
    const limit = parseInt(req.query.limit as string) || 50;
    const status = req.query.status as string;
    
    const documents = await dbService.getRecentDocuments(limit, status);
    res.json(documents);
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Delete single document
app.delete('/api/documents/:id', async (req, res) => {
  try {
    const dbService = getDatabaseService();
    const { id } = req.params;
    
    await dbService.deleteDocument(id);
    
    res.json({ success: true, message: `Document ${id} deleted` });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Delete multiple documents
app.post('/api/documents/delete-batch', async (req, res) => {
  try {
    const dbService = getDatabaseService();
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No document IDs provided' 
      });
    }
    
    const result = await dbService.deleteDocuments(ids);
    
    res.json({ 
      success: true, 
      message: `${result.count} document(s) deleted`,
      deletedCount: result.count,
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log('========================================');
  console.log('  Email Document Extractor - Backend');
  console.log('========================================');
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📧 Gmail: ${config.gmail.userEmail}`);
  console.log('');
  console.log('Endpoints:');
  console.log(`  GET  /api/health    - Health check`);
  console.log(`  GET  /api/emails    - List pending emails`);
  console.log(`  POST /api/process   - Process all emails`);
  console.log(`  GET  /api/stats     - Get statistics`);
  console.log(`  GET  /api/documents - Get documents`);
  console.log('========================================\n');
});
