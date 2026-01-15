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

// Process all pending emails (PARALLEL MODE)
app.post('/api/process', async (req, res) => {
  const totalStartTime = Date.now();
  
  console.log('\n========================================');
  console.log('  Processing emails via API');
  console.log('  ⚡ PARALLEL MODE');
  console.log('========================================\n');

  const gmailService = getGmailService();
  const textractService = getTextractService();
  const dbService = getDatabaseService();

  let allResults: Array<{
    success: boolean;
    fileName: string;
    documentId?: string;
    error?: string;
    duration?: number;
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
      const emailStartTime = Date.now();
      console.log(`📧 Processing: ${email.subject} (${email.attachments.length} attachments)`);
      
      // ⚡ Process ALL attachments in PARALLEL
      const emailResults = await Promise.all(
        email.attachments.map(async (attachment, idx) => {
          const startTime = Date.now();
          try {
            console.log(`   [${idx + 1}] 📄 Starting: ${attachment.filename}`);
            
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
            
            const duration = Date.now() - startTime;
            console.log(`   [${idx + 1}] ✅ Done: ${attachment.filename} (${(duration / 1000).toFixed(1)}s)`);
            
            return {
              success: true,
              fileName: attachment.filename,
              documentId: document.id,
              duration,
            };
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            const duration = Date.now() - startTime;
            console.error(`   [${idx + 1}] ❌ Error: ${attachment.filename} - ${errorMsg}`);
            return {
              success: false,
              fileName: attachment.filename,
              error: errorMsg,
              duration,
            };
          }
        })
      );
      
      allResults = [...allResults, ...emailResults];
      
      const emailDuration = ((Date.now() - emailStartTime) / 1000).toFixed(1);
      console.log(`   ⏱️ Email completed in ${emailDuration}s\n`);

      // Mark email as processed if all attachments succeeded
      if (emailResults.every(r => r.success)) {
        await dbService.markEmailProcessed(email.id);
        await gmailService.markAsRead(email.id);
        console.log(`   ✉️ Email marked as read\n`);
      }
    }

    const successful = allResults.filter(r => r.success);
    const failed = allResults.filter(r => !r.success);
    const totalDuration = ((Date.now() - totalStartTime) / 1000).toFixed(1);

    console.log('\n========================================');
    console.log(`  ✅ Completed: ${successful.length} success, ${failed.length} failed`);
    console.log(`  ⏱️ Total time: ${totalDuration}s`);
    console.log('========================================\n');

    res.json({
      success: true,
      message: 'Procesamiento completado',
      emailsProcessed: emails.length,
      documentsProcessed: allResults.length,
      successful: successful.length,
      failed: failed.length,
      totalDuration: parseFloat(totalDuration),
      results: allResults,
    });

  } catch (error) {
    console.error('❌ Process error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      results: allResults,
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

/**
 * =============================================================================
 * TODO: ENDPOINT DE CHAT CON ADK - ACTIVAR CUANDO HAYA CUOTA DE GEMINI
 * =============================================================================
 * 
 * Descomentar este endpoint cuando tengas cuota de Gemini disponible:
 * 
 * import { runAgent } from './agent';
 * 
 * app.post('/api/chat', async (req, res) => {
 *   try {
 *     const { message } = req.body;
 *     
 *     if (!message) {
 *       return res.status(400).json({ error: 'Message is required' });
 *     }
 *     
 *     console.log('🤖 Processing chat message:', message);
 *     
 *     // Ejecutar el agente ADK con las tools configuradas
 *     const response = await runAgent(message);
 *     
 *     console.log('✅ Agent response:', response.substring(0, 100) + '...');
 *     
 *     res.json({
 *       message: response,
 *       timestamp: new Date().toISOString(),
 *     });
 *   } catch (error) {
 *     console.error('❌ Chat error:', error);
 *     res.status(500).json({
 *       error: error instanceof Error ? error.message : 'Unknown error',
 *     });
 *   }
 * });
 * 
 * =============================================================================
 */

// Placeholder chat endpoint (sin ADK)
app.post('/api/chat', (req, res) => {
  const { message } = req.body;
  
  res.json({
    message: `[Mock] Recibido: "${message}". ADK no disponible por cuota de Gemini.`,
    timestamp: new Date().toISOString(),
    adkEnabled: false,
  });
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
  console.log(`  POST /api/chat      - Chat with agent (TODO: ADK)`);
  console.log(`  GET  /api/stats     - Get statistics`);
  console.log(`  GET  /api/documents - Get documents`);
  console.log('========================================\n');
});
