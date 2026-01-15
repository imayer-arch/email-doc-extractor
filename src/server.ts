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
import { getGmailWatchService, GmailNotification } from './services/gmail-watch.service';
import { getEmailProcessorService } from './services/email-processor.service';
import { config } from './config';
import { encrypt, decrypt } from './utils/crypto';
import { loggers, logDuration, logError } from './lib/logger';
import { requestIdMiddleware, httpLogger, errorLogger } from './middleware/requestLogger';
import { metricsMiddleware } from './middleware/metrics';
import { startMetricsServer, pubsubNotificationsTotal, webhookDuration, recordDuration } from './lib/metrics';

// Queue imports
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { 
  emailQueue, 
  attachmentQueue, 
  enqueueEmailJob, 
  getQueueStats,
  closeQueues,
} from './queues';

const prisma = new PrismaClient();
const log = loggers.server;

const app = express();
const PORT = process.env.BACKEND_PORT || 3000;

// Queue mode flag - when true, webhooks enqueue instead of processing directly
const USE_QUEUE = process.env.USE_QUEUE !== 'false'; // Default to true

// Bull Board setup (queue monitoring dashboard)
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullMQAdapter(emailQueue),
    new BullMQAdapter(attachmentQueue),
  ],
  serverAdapter,
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(requestIdMiddleware);
app.use(httpLogger);
app.use(metricsMiddleware);

// Mount Bull Board dashboard
app.use('/admin/queues', serverAdapter.getRouter());

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
    
    // Automatically start watching for new emails (Push notifications)
    try {
      const watchService = getGmailWatchService();
      await watchService.startWatch(userId as string);
      console.log(`Gmail watch started for user: ${userId}`);
    } catch (watchError) {
      // Don't fail the OAuth flow if watch fails - user can retry later
      console.error(`Failed to start Gmail watch for user ${userId}:`, watchError);
    }
    
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
    
    // Stop watch before disconnecting
    const watchService = getGmailWatchService();
    await watchService.stopWatch(userId);
    
    await prisma.user.update({
      where: { id: userId },
      data: {
        gmailConnected: false,
        gmailAccessToken: null,
        gmailRefreshToken: null,
        gmailTokenExpiry: null,
        gmailHistoryId: null,
        gmailWatchExpiry: null,
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

// =============================================================================
// Gmail Push Notifications (Pub/Sub Webhook)
// =============================================================================

/**
 * Webhook endpoint for Gmail Pub/Sub notifications
 * This is called by Google Cloud Pub/Sub when a new email arrives
 * 
 * When USE_QUEUE=true (default): Enqueues job and responds immediately (<100ms)
 * When USE_QUEUE=false: Processes directly (legacy behavior)
 */
app.post('/api/webhook/gmail', async (req, res) => {
  const webhookLog = loggers.webhook;
  const startTime = Date.now();
  
  // Record metric
  pubsubNotificationsTotal.add(1);
  
  webhookLog.info({ action: 'webhook_received', useQueue: USE_QUEUE }, 'Gmail webhook received');
  
  try {
    // Decode Pub/Sub message
    const message = req.body.message;
    if (!message?.data) {
      webhookLog.warn({ action: 'webhook_empty' }, 'No message data received');
      res.status(200).send('OK');
      return;
    }
    
    // Decode base64 data
    const dataStr = Buffer.from(message.data, 'base64').toString('utf-8');
    const notification: GmailNotification = JSON.parse(dataStr);
    
    webhookLog.info({
      action: 'notification_parsed',
      email: notification.emailAddress,
      historyId: notification.historyId,
      messageId: message.messageId || 'N/A',
    }, `Push notification for ${notification.emailAddress}`);
    
    if (USE_QUEUE) {
      // ===== QUEUE MODE: Enqueue and respond immediately =====
      const jobId = await enqueueEmailJob({
        emailAddress: notification.emailAddress,
        historyId: String(notification.historyId),
        receivedAt: new Date().toISOString(),
      });
      
      // Respond immediately (Pub/Sub requires response within 10 seconds)
      res.status(200).json({ 
        status: 'queued', 
        jobId,
        mode: 'async',
      });
      
      const duration = Date.now() - startTime;
      webhookLog.info({
        action: 'webhook_queued',
        email: notification.emailAddress,
        jobId,
        duration,
      }, `Job enqueued in ${duration}ms`);
      
      recordDuration(webhookDuration, startTime, { status: 'queued' });
      
    } else {
      // ===== DIRECT MODE: Process immediately (legacy) =====
      res.status(200).send('OK');
      
      const processor = getEmailProcessorService();
      const result = await processor.processNewEmails(notification);
      
      recordDuration(webhookDuration, startTime, {
        status: result.errors.length > 0 ? 'partial' : 'success',
      });
      
      const duration = Date.now() - startTime;
      webhookLog.info({
        action: 'webhook_completed',
        email: notification.emailAddress,
        messagesProcessed: result.messagesProcessed,
        documentsExtracted: result.documentsExtracted,
        errorCount: result.errors.length,
        duration,
      }, `Webhook completed: ${result.messagesProcessed} messages, ${result.documentsExtracted} docs in ${duration}ms`);
      
      if (result.errors.length > 0) {
        webhookLog.warn({ action: 'webhook_errors', errors: result.errors }, `Webhook had ${result.errors.length} errors`);
      }
    }
    
  } catch (error) {
    recordDuration(webhookDuration, startTime, { status: 'error' });
    logError(webhookLog, error, { action: 'webhook_error' });
    // Still respond 200 to prevent Pub/Sub retries for parsing errors
    if (!res.headersSent) {
      res.status(200).send('OK');
    }
  }
});

// =============================================================================
// Gmail Watch Management Endpoints
// =============================================================================

/**
 * Start watching Gmail for a user
 * This sets up push notifications for new emails
 */
app.post('/api/gmail/watch/start', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    const watchService = getGmailWatchService();
    const result = await watchService.startWatch(userId);
    
    res.json({
      success: true,
      message: 'Gmail watch started',
      historyId: result.historyId,
      expiresAt: new Date(parseInt(result.expiration)).toISOString(),
    });
  } catch (error) {
    console.error('Error starting Gmail watch:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Stop watching Gmail for a user
 */
app.post('/api/gmail/watch/stop', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    const watchService = getGmailWatchService();
    await watchService.stopWatch(userId);
    
    res.json({
      success: true,
      message: 'Gmail watch stopped',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get watch status for a user
 */
app.get('/api/gmail/watch/status', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    const watchService = getGmailWatchService();
    const status = await watchService.getWatchStatus(userId as string);
    
    res.json(status);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Renew expiring watches
 * Should be called periodically via cron job
 */
app.post('/api/gmail/watch/renew-all', async (req, res) => {
  try {
    const watchService = getGmailWatchService();
    const result = await watchService.renewExpiringWatches(24); // Renew if expiring within 24h
    
    res.json({
      success: true,
      renewed: result.renewed,
      errors: result.errors,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get all active watches (admin)
 */
app.get('/api/gmail/watch/list', async (req, res) => {
  try {
    const watchService = getGmailWatchService();
    const watches = await watchService.getActiveWatches();
    
    res.json({
      count: watches.length,
      watches,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Queue Management Endpoints
// =============================================================================

/**
 * Get queue statistics
 */
app.get('/api/queues/stats', async (req, res) => {
  try {
    const stats = await getQueueStats();
    res.json({
      mode: USE_QUEUE ? 'queue' : 'direct',
      queues: stats,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
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

// =============================================================================
// Watch Renewal Job
// =============================================================================

// Interval for watch renewal check (every 12 hours)
const WATCH_RENEWAL_INTERVAL = 12 * 60 * 60 * 1000;
let renewalInterval: NodeJS.Timeout | null = null;

/**
 * Start the automatic watch renewal job
 * This ensures watches don't expire (they expire after 7 days)
 */
function startWatchRenewalJob(): void {
  if (renewalInterval) {
    clearInterval(renewalInterval);
  }
  
  console.log('[WatchRenewal] Starting automatic renewal job (every 12h)');
  
  renewalInterval = setInterval(async () => {
    console.log('[WatchRenewal] Running scheduled renewal check...');
    try {
      const watchService = getGmailWatchService();
      const result = await watchService.renewExpiringWatches(48); // Renew if expiring within 48h
      console.log(`[WatchRenewal] Renewed ${result.renewed} watches, ${result.errors.length} errors`);
    } catch (error) {
      console.error('[WatchRenewal] Error:', error);
    }
  }, WATCH_RENEWAL_INTERVAL);
  
  // Run immediately on startup after a short delay
  setTimeout(async () => {
    console.log('[WatchRenewal] Running initial renewal check...');
    try {
      const watchService = getGmailWatchService();
      const result = await watchService.renewExpiringWatches(48);
      console.log(`[WatchRenewal] Initial check: ${result.renewed} renewed, ${result.errors.length} errors`);
    } catch (error) {
      console.error('[WatchRenewal] Initial check error:', error);
    }
  }, 5000); // Wait 5 seconds after startup
}

// Error handler middleware (must be last)
app.use(errorLogger);

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
  log.info({ signal }, 'Shutting down server...');
  
  // Close queue connections
  await closeQueues();
  
  log.info('Server shut down gracefully');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
app.listen(PORT, () => {
  log.info({
    action: 'server_started',
    port: PORT,
    gmail: config.gmail.userEmail,
    pubsub: config.pubsub.topicPath || 'Not configured',
    queueMode: USE_QUEUE,
  }, `Server running on http://localhost:${PORT}`);
  
  // Also log to console for visibility during development
  console.log('========================================');
  console.log('  Email Document Extractor - Backend');
  console.log('========================================');
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📧 Gmail: ${config.gmail.userEmail}`);
  console.log(`☁️ Pub/Sub: ${config.pubsub.topicPath || 'Not configured'}`);
  console.log(`📋 Queue Mode: ${USE_QUEUE ? 'ENABLED (async)' : 'DISABLED (sync)'}`);
  console.log('');
  console.log('Core Endpoints:');
  console.log(`  GET  /api/health       - Health check`);
  console.log(`  GET  /api/emails       - List pending emails`);
  console.log(`  POST /api/process      - Process all emails`);
  console.log(`  GET  /api/stats        - Get statistics`);
  console.log(`  GET  /api/documents    - Get documents`);
  console.log('');
  console.log('Gmail Push (Pub/Sub):');
  console.log(`  POST /api/webhook/gmail        - Pub/Sub webhook`);
  console.log(`  POST /api/gmail/watch/start    - Start watching`);
  console.log(`  POST /api/gmail/watch/stop     - Stop watching`);
  console.log(`  GET  /api/gmail/watch/status   - Get watch status`);
  console.log(`  POST /api/gmail/watch/renew-all - Renew all watches`);
  console.log('');
  console.log('Queue Management:');
  console.log(`  GET  /api/queues/stats     - Queue statistics`);
  console.log(`  🖥️  /admin/queues          - Bull Board Dashboard`);
  console.log('========================================\n');
  
  // Start the automatic watch renewal job
  startWatchRenewalJob();
  
  // Start Prometheus metrics endpoint
  startMetricsServer();
});
