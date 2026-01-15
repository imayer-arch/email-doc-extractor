/**
 * Email Queue Processor
 * Handles email and attachment processing jobs
 */

import { Job, Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { GmailService } from '../services/gmail.service';
import { getTextractService } from '../services/textract.service';
import { getDatabaseService } from '../services/database.service';
import { loggers, logError } from '../lib/logger';
import {
  emailsProcessedTotal,
  documentsExtractedTotal,
  emailsSkippedTotal,
  processingErrorsTotal,
  pubsubNotificationsTotal,
} from '../lib/metrics';
import {
  connectionOptions,
  QUEUE_NAMES,
  EmailJobData,
  AttachmentJobData,
  enqueueAttachmentJob,
} from './index';

const prisma = new PrismaClient();
const log = loggers.emailProcessor;

// In-memory lock to prevent parallel processing of the same email
const processingEmails = new Set<string>();

function acquireLock(emailId: string): boolean {
  if (processingEmails.has(emailId)) {
    return false;
  }
  processingEmails.add(emailId);
  return true;
}

function releaseLock(emailId: string): void {
  processingEmails.delete(emailId);
}

// =============================================================================
// Email Processing Worker
// =============================================================================

export async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { emailAddress, historyId } = job.data;
  
  log.info({
    jobId: job.id,
    email: emailAddress,
    historyId,
    attempt: job.attemptsMade + 1,
  }, 'Processing email job');

  pubsubNotificationsTotal.add(1);

  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email: emailAddress },
    select: {
      id: true,
      email: true,
      gmailConnected: true,
      gmailRefreshToken: true,
      gmailHistoryId: true,
    },
  });

  if (!user) {
    log.warn({ email: emailAddress }, 'User not found');
    return;
  }

  if (!user.gmailConnected || !user.gmailRefreshToken) {
    log.warn({ email: emailAddress }, 'Gmail not connected');
    return;
  }

  try {
    const gmailService = await GmailService.forUser(user.id);

    // Get unread emails with attachments
    const emails = await gmailService.getUnreadEmailsWithAttachments();
    log.info({ count: emails.length }, 'Found unread emails with attachments');

    if (emails.length === 0) {
      await updateHistoryId(user.id, historyId);
      return;
    }

    // Filter out already processed emails
    const processedEmailIds = await prisma.processedEmail.findMany({
      where: { userId: user.id },
      select: { emailId: true },
    });
    const processedSet = new Set(processedEmailIds.map(p => p.emailId));
    
    const newEmails = emails.filter(e => !processedSet.has(e.id));
    log.info({ 
      total: emails.length, 
      new: newEmails.length,
      skipped: emails.length - newEmails.length 
    }, 'Filtered emails');

    if (newEmails.length === 0) {
      await updateHistoryId(user.id, historyId);
      return;
    }

    // Process each new email
    for (const email of newEmails) {
      const messageId = email.id;
      
      // Try to acquire lock
      if (!acquireLock(messageId)) {
        log.debug({ emailId: messageId }, 'Skipped - already being processed');
        emailsSkippedTotal.add(1);
        continue;
      }

      try {
        // Double-check in DB
        const alreadyProcessed = await prisma.processedEmail.findUnique({
          where: { emailId: messageId },
        });
        
        if (alreadyProcessed) {
          log.debug({ emailId: messageId }, 'Skipped - already in DB');
          emailsSkippedTotal.add(1);
          releaseLock(messageId);
          continue;
        }

        log.info({
          emailId: messageId,
          subject: email.subject,
          attachmentCount: email.attachments.length,
        }, 'Processing email');

        // Mark as processed IMMEDIATELY
        await prisma.processedEmail.create({
          data: { emailId: messageId, userId: user.id },
        });

        emailsProcessedTotal.add(1);

        // Enqueue attachment jobs IN PARALLEL
        const attachmentJobs = email.attachments.map(attachment => 
          enqueueAttachmentJob({
            userId: user.id,
            emailId: messageId,
            emailSubject: email.subject,
            emailFrom: email.from,
            emailDate: email.date,
            attachment: {
              filename: attachment.filename,
              mimeType: attachment.mimeType,
              data: attachment.data.toString('base64'),
            },
          })
        );

        await Promise.all(attachmentJobs);
        
        log.info({
          emailId: messageId,
          attachmentsEnqueued: email.attachments.length,
        }, 'Attachment jobs enqueued');

        // Mark email as read
        const markedAsRead = await gmailService.markAsRead(messageId);
        if (!markedAsRead) {
          log.warn({ emailId: messageId }, 'Could not mark as read');
        }

      } catch (err) {
        logError(log, err, { emailId: messageId });
        processingErrorsTotal.add(1, { type: 'email' });
      } finally {
        releaseLock(messageId);
      }
    }

    // Update historyId
    await updateHistoryId(user.id, historyId);

  } catch (err) {
    logError(log, err, { email: emailAddress });
    processingErrorsTotal.add(1, { type: 'email_job' });
    
    // Still try to update historyId
    try {
      await updateHistoryId(user.id, historyId);
    } catch (updateErr) {
      log.error({ err: updateErr }, 'Failed to update historyId');
    }
    
    throw err; // Re-throw to trigger retry
  }
}

// =============================================================================
// Attachment Processing Worker
// =============================================================================

export async function processAttachmentJob(job: Job<AttachmentJobData>): Promise<void> {
  const { userId, emailId, emailSubject, emailFrom, emailDate, attachment } = job.data;
  
  log.info({
    jobId: job.id,
    emailId,
    filename: attachment.filename,
    attempt: job.attemptsMade + 1,
  }, 'Processing attachment job');

  try {
    const textractService = getTextractService();
    const dbService = getDatabaseService();

    // Decode base64 data
    const documentBuffer = Buffer.from(attachment.data, 'base64');

    // Extract with Textract
    log.info({ filename: attachment.filename }, 'Starting Textract analysis');
    const extractionResult = await textractService.analyzeDocumentAsync(
      documentBuffer,
      attachment.filename,
      attachment.mimeType
    );

    // Save to database
    await dbService.saveExtractedDocument({
      emailId,
      emailSubject,
      emailFrom,
      emailDate,
      fileName: attachment.filename,
      fileType: attachment.mimeType,
      extractionResult,
      userId,
    });

    documentsExtractedTotal.add(1);
    
    log.info({
      emailId,
      filename: attachment.filename,
      confidence: extractionResult.averageConfidence,
    }, 'Document extracted successfully');

  } catch (err) {
    logError(log, err, { emailId, filename: attachment.filename });
    processingErrorsTotal.add(1, { type: 'attachment' });
    throw err; // Re-throw to trigger retry
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

async function updateHistoryId(userId: string, historyId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { gmailHistoryId: String(historyId) },
  });
  log.debug({ userId, historyId }, 'Updated historyId');
}

// =============================================================================
// Create Workers
// =============================================================================

export function createEmailWorker(concurrency: number = 2): Worker<EmailJobData> {
  const worker = new Worker<EmailJobData>(
    QUEUE_NAMES.EMAIL_PROCESSING,
    processEmailJob,
    {
      connection: connectionOptions,
      concurrency,
    }
  );

  worker.on('completed', (job) => {
    log.info({ jobId: job.id }, 'Email job completed');
  });

  worker.on('failed', (job, err) => {
    log.error({ jobId: job?.id, err: err.message }, 'Email job failed');
  });

  worker.on('error', (err) => {
    log.error({ err }, 'Email worker error');
  });

  return worker;
}

export function createAttachmentWorker(concurrency: number = 3): Worker<AttachmentJobData> {
  const worker = new Worker<AttachmentJobData>(
    QUEUE_NAMES.ATTACHMENT_PROCESSING,
    processAttachmentJob,
    {
      connection: connectionOptions,
      concurrency,
    }
  );

  worker.on('completed', (job) => {
    log.info({ jobId: job.id, filename: job.data.attachment.filename }, 'Attachment job completed');
  });

  worker.on('failed', (job, err) => {
    log.error({ jobId: job?.id, filename: job?.data.attachment.filename, err: err.message }, 'Attachment job failed');
  });

  worker.on('error', (err) => {
    log.error({ err }, 'Attachment worker error');
  });

  return worker;
}
