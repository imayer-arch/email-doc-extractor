/**
 * Backend Server - Express API
 * Expone endpoints para que el frontend pueda llamar
 */

import express from 'express';
import cors from 'cors';
import { google } from 'googleapis';
import { PrismaClient } from '@prisma/client';
import { getGmailService, GmailService } from './services/gmail.service';
import { getTextractService } from './services/textract.service';
import { getDatabaseService } from './services/database.service';
import { config } from './config';
import { encrypt, decrypt } from './utils/crypto';

const prisma = new PrismaClient();

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
// Supports multi-user: pass userId in body to use user's Gmail tokens
app.post('/api/process', async (req, res) => {
  const totalStartTime = Date.now();
  const { userId } = req.body;
  
  console.log('\n========================================');
  console.log('  Processing emails via API');
  console.log('  ⚡ PARALLEL MODE');
  if (userId) console.log(`  👤 User: ${userId}`);
  console.log('========================================\n');

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
    // Get Gmail service (user-specific or default)
    let gmailService;
    if (userId) {
      // Use user's own Gmail tokens
      gmailService = await GmailService.forUser(userId);
    } else {
      // Fallback to default (for backwards compatibility)
      gmailService = getGmailService();
    }

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
            
            // Save to database (with userId if provided)
            const document = await dbService.saveExtractedDocument({
              emailId: email.id,
              emailSubject: email.subject,
              emailFrom: email.from,
              emailDate: email.date,
              fileName: attachment.filename,
              fileType: attachment.mimeType,
              extractionResult,
              userId,
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
        await dbService.markEmailProcessed(email.id, userId);
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

// Get documents (supports filtering by userId)
app.get('/api/documents', async (req, res) => {
  try {
    const dbService = getDatabaseService();
    const limit = parseInt(req.query.limit as string) || 50;
    const status = req.query.status as string;
    const userId = req.query.userId as string;
    
    const documents = await dbService.getRecentDocuments(limit, status, userId);
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

// =============================================================================
// Gmail OAuth Endpoints - Multi-user support
// =============================================================================

// Get or create user by email (used by frontend after OAuth login)
app.post('/api/user/sync', async (req, res) => {
  try {
    const { email, name, image } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }
    
    // Upsert user - create if not exists, update if exists
    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        name: name || null,
        image: image || null,
      },
      update: {
        name: name || undefined,
        image: image || undefined,
      },
      select: {
        id: true,
        email: true,
        name: true,
        gmailConnected: true,
      },
    });
    
    console.log(`User synced: ${email} (id: ${user.id})`);
    res.json(user);
  } catch (error) {
    console.error('Error syncing user:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Get user info by ID
app.get('/api/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        gmailConnected: true,
      },
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Generate Gmail OAuth URL for user
app.get('/api/auth/gmail/url', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    const oauth2Client = new google.auth.OAuth2(
      config.gmail.clientId,
      config.gmail.clientSecret,
      `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/auth/gmail/callback`
    );
    
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify',
      ],
      prompt: 'consent', // Force refresh token
      state: userId as string, // Pass userId to callback
    });
    
    res.json({ url });
  } catch (error) {
    console.error('Error generating Gmail OAuth URL:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Gmail OAuth callback
app.get('/api/auth/gmail/callback', async (req, res) => {
  try {
    const { code, state: userId } = req.query;
    
    if (!code || !userId) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/dashboard?gmail=error&reason=missing_params`);
    }
    
    const oauth2Client = new google.auth.OAuth2(
      config.gmail.clientId,
      config.gmail.clientSecret,
      `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/auth/gmail/callback`
    );
    
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code as string);
    
    if (!tokens.refresh_token) {
      console.error('No refresh token received');
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/dashboard?gmail=error&reason=no_refresh_token`);
    }
    
    // Encrypt and save tokens
    await prisma.user.update({
      where: { id: userId as string },
      data: {
        gmailConnected: true,
        gmailAccessToken: encrypt(tokens.access_token || ''),
        gmailRefreshToken: encrypt(tokens.refresh_token),
        gmailTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
    });
    
    console.log(`Gmail connected for user: ${userId}`);
    
    // Redirect back to frontend
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/dashboard?gmail=connected`);
  } catch (error) {
    console.error('Gmail OAuth callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/dashboard?gmail=error&reason=callback_failed`);
  }
});

// Disconnect Gmail for user
app.post('/api/auth/gmail/disconnect', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    await prisma.user.update({
      where: { id: userId },
      data: {
        gmailConnected: false,
        gmailAccessToken: null,
        gmailRefreshToken: null,
        gmailTokenExpiry: null,
      },
    });
    
    console.log(`Gmail disconnected for user: ${userId}`);
    
    res.json({ success: true, message: 'Gmail disconnected' });
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
