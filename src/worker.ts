/**
 * Worker Entry Point
 * Runs the queue workers for processing emails and attachments
 * 
 * Usage: npm run worker
 */

// Set worker metrics port BEFORE importing metrics module
// This MUST run before any other imports
process.env.WORKER_METRICS_PORT = process.env.WORKER_METRICS_PORT || '9465';

// Load dotenv first
import 'dotenv/config';

// Worker configuration (before dynamic imports)
const EMAIL_WORKER_CONCURRENCY = parseInt(process.env.EMAIL_WORKER_CONCURRENCY || '2');
const ATTACHMENT_WORKER_CONCURRENCY = parseInt(process.env.ATTACHMENT_WORKER_CONCURRENCY || '3');

async function main() {
  // Dynamic imports to ensure WORKER_METRICS_PORT is set first
  const { createEmailWorker, createAttachmentWorker } = await import('./queues/email.processor');
  const { closeQueues, getQueueStats } = await import('./queues');
  const { startMetricsServer } = await import('./lib/metrics');
  const { loggers } = await import('./lib/logger');
  
  const log = loggers.server;

  log.info('Starting workers...');
  log.info({
    emailConcurrency: EMAIL_WORKER_CONCURRENCY,
    attachmentConcurrency: ATTACHMENT_WORKER_CONCURRENCY,
  }, 'Worker configuration');

  // Start metrics server (different port from main server)
  const metricsPort = parseInt(process.env.WORKER_METRICS_PORT || '9465');
  startMetricsServer();
  log.info({ port: metricsPort }, 'Worker metrics available');

  // Create workers
  const emailWorker = createEmailWorker(EMAIL_WORKER_CONCURRENCY);
  const attachmentWorker = createAttachmentWorker(ATTACHMENT_WORKER_CONCURRENCY);

  log.info('Workers started successfully');
  log.info('Press Ctrl+C to stop');

  // Log queue stats periodically
  const statsInterval = setInterval(async () => {
    try {
      const stats = await getQueueStats();
      log.info({
        email: stats.email,
        attachment: stats.attachment,
      }, 'Queue stats');
    } catch (err) {
      log.error({ err }, 'Failed to get queue stats');
    }
  }, 60000); // Every minute

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    log.info({ signal }, 'Shutting down workers...');
    
    clearInterval(statsInterval);
    
    // Close workers (waits for active jobs to complete)
    await Promise.all([
      emailWorker.close(),
      attachmentWorker.close(),
    ]);
    
    await closeQueues();
    
    log.info('Workers shut down gracefully');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Keep the process running
  await new Promise(() => {});
}

main().catch((err) => {
  console.error('Worker crashed:', err);
  process.exit(1);
});
