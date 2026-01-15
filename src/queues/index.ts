/**
 * Queue Service - BullMQ Configuration
 * Manages job queues for email processing
 */

import { Queue, QueueEvents, JobsOptions, ConnectionOptions } from 'bullmq';
import { loggers } from '../lib/logger';

const log = loggers.server;

// Redis connection configuration
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

// Connection options for BullMQ (uses its own ioredis internally)
const connectionOptions: ConnectionOptions = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // Required for BullMQ
};

log.info({ host: REDIS_HOST, port: REDIS_PORT }, 'Redis configuration loaded');

// Queue names
export const QUEUE_NAMES = {
  EMAIL_PROCESSING: 'email-processing',
  ATTACHMENT_PROCESSING: 'attachment-processing',
} as const;

// Default job options
const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000, // 5 seconds initial delay
  },
  removeOnComplete: {
    count: 100, // Keep last 100 completed jobs
    age: 24 * 60 * 60, // Keep for 24 hours
  },
  removeOnFail: {
    count: 500, // Keep last 500 failed jobs for debugging
    age: 7 * 24 * 60 * 60, // Keep for 7 days
  },
};

// =============================================================================
// Email Processing Queue
// =============================================================================

export interface EmailJobData {
  emailAddress: string;
  historyId: string;
  receivedAt: string;
}

export const emailQueue = new Queue<EmailJobData, void, string>(QUEUE_NAMES.EMAIL_PROCESSING, {
  connection: connectionOptions,
  defaultJobOptions,
});

// =============================================================================
// Attachment Processing Queue
// =============================================================================

export interface AttachmentJobData {
  userId: string;
  emailId: string;
  emailSubject: string;
  emailFrom: string;
  emailDate: Date;
  attachment: {
    filename: string;
    mimeType: string;
    data: string; // Base64 encoded
  };
}

export const attachmentQueue = new Queue<AttachmentJobData, void, string>(QUEUE_NAMES.ATTACHMENT_PROCESSING, {
  connection: connectionOptions,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 2, // Fewer retries for attachments (Textract is expensive)
  },
});

// =============================================================================
// Queue Events (for monitoring)
// =============================================================================

export const emailQueueEvents = new QueueEvents(QUEUE_NAMES.EMAIL_PROCESSING, {
  connection: connectionOptions,
});

export const attachmentQueueEvents = new QueueEvents(QUEUE_NAMES.ATTACHMENT_PROCESSING, {
  connection: connectionOptions,
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Add an email processing job to the queue
 */
export async function enqueueEmailJob(data: EmailJobData): Promise<string> {
  const job = await emailQueue.add('process-email', data, {
    jobId: `email-${data.emailAddress}-${data.historyId}`, // Dedupe by email+historyId
  });
  
  log.info({
    jobId: job.id,
    email: data.emailAddress,
    historyId: data.historyId,
  }, 'Email job enqueued');
  
  return job.id || '';
}

/**
 * Add an attachment processing job to the queue
 */
export async function enqueueAttachmentJob(data: AttachmentJobData): Promise<string> {
  const job = await attachmentQueue.add('process-attachment', data, {
    jobId: `attachment-${data.emailId}-${data.attachment.filename}`,
  });
  
  log.info({
    jobId: job.id,
    emailId: data.emailId,
    filename: data.attachment.filename,
  }, 'Attachment job enqueued');
  
  return job.id || '';
}

/**
 * Get queue statistics
 */
export async function getQueueStats() {
  const [emailCounts, attachmentCounts] = await Promise.all([
    emailQueue.getJobCounts(),
    attachmentQueue.getJobCounts(),
  ]);

  return {
    email: emailCounts,
    attachment: attachmentCounts,
  };
}

/**
 * Graceful shutdown
 */
export async function closeQueues() {
  log.info('Closing queue connections...');
  await Promise.all([
    emailQueue.close(),
    attachmentQueue.close(),
    emailQueueEvents.close(),
    attachmentQueueEvents.close(),
  ]);
  log.info('Queue connections closed');
}

// Export connection options for workers
export { connectionOptions };
