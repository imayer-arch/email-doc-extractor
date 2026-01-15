/**
 * Metrics Module - OpenTelemetry
 * Business and infrastructure metrics for observability
 */

import {
  MeterProvider,
} from '@opentelemetry/sdk-metrics';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { metrics, Meter, Counter, Histogram, UpDownCounter } from '@opentelemetry/api';

// Prometheus exporter configuration
// WORKER_METRICS_PORT takes precedence for worker process, otherwise use PROMETHEUS_PORT
const prometheusPort = parseInt(
  process.env.WORKER_METRICS_PORT || process.env.PROMETHEUS_PORT || '9464'
);

// Create Prometheus exporter
const prometheusExporter = new PrometheusExporter({
  port: prometheusPort,
  endpoint: '/metrics',
});

// Determine service name based on which process is running
const serviceName = process.env.WORKER_METRICS_PORT 
  ? 'email-doc-extractor-worker' 
  : 'email-doc-extractor';

// Create meter provider with resource attributes
const meterProvider = new MeterProvider({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
    'deployment.environment': process.env.NODE_ENV || 'development',
  }),
  readers: [prometheusExporter],
});

// Register as global meter provider
metrics.setGlobalMeterProvider(meterProvider);

// Create meter for our application
const meter: Meter = metrics.getMeter('email-doc-extractor', '1.0.0');

// =============================================================================
// Business Metrics - Email Processing
// =============================================================================

/** Total emails processed */
export const emailsProcessedTotal: Counter = meter.createCounter('emails_processed_total', {
  description: 'Total number of emails processed',
  unit: '1',
});

/** Total documents extracted */
export const documentsExtractedTotal: Counter = meter.createCounter('documents_extracted_total', {
  description: 'Total number of documents extracted from emails',
  unit: '1',
});

/** Emails skipped (already processed) */
export const emailsSkippedTotal: Counter = meter.createCounter('emails_skipped_total', {
  description: 'Total emails skipped because already processed',
  unit: '1',
});

/** Duplicate emails prevented by lock */
export const duplicatesPreventedTotal: Counter = meter.createCounter('duplicates_prevented_total', {
  description: 'Duplicate processing attempts prevented by in-memory lock',
  unit: '1',
});

/** Processing errors */
export const processingErrorsTotal: Counter = meter.createCounter('processing_errors_total', {
  description: 'Total processing errors',
  unit: '1',
});

// =============================================================================
// Business Metrics - Pub/Sub
// =============================================================================

/** Pub/Sub notifications received */
export const pubsubNotificationsTotal: Counter = meter.createCounter('pubsub_notifications_total', {
  description: 'Total Pub/Sub notifications received',
  unit: '1',
});

/** Webhook processing duration */
export const webhookDuration: Histogram = meter.createHistogram('webhook_duration_seconds', {
  description: 'Webhook processing duration in seconds',
  unit: 's',
  advice: {
    explicitBucketBoundaries: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120],
  },
});

// =============================================================================
// External Service Metrics - Textract
// =============================================================================

/** Textract API calls */
export const textractCallsTotal: Counter = meter.createCounter('textract_calls_total', {
  description: 'Total Textract API calls',
  unit: '1',
});

/** Textract errors */
export const textractErrorsTotal: Counter = meter.createCounter('textract_errors_total', {
  description: 'Total Textract API errors',
  unit: '1',
});

/** Textract processing duration */
export const textractDuration: Histogram = meter.createHistogram('textract_duration_seconds', {
  description: 'Textract processing duration in seconds',
  unit: 's',
  advice: {
    explicitBucketBoundaries: [1, 5, 10, 20, 30, 60, 120, 300],
  },
});

/** Textract extraction confidence */
export const textractConfidence: Histogram = meter.createHistogram('textract_confidence', {
  description: 'Textract extraction confidence score (0-100)',
  unit: '%',
  advice: {
    explicitBucketBoundaries: [50, 60, 70, 80, 85, 90, 95, 99],
  },
});

// =============================================================================
// External Service Metrics - Gmail
// =============================================================================

/** Gmail API calls */
export const gmailCallsTotal: Counter = meter.createCounter('gmail_api_calls_total', {
  description: 'Total Gmail API calls',
  unit: '1',
});

/** Gmail API errors */
export const gmailErrorsTotal: Counter = meter.createCounter('gmail_api_errors_total', {
  description: 'Total Gmail API errors',
  unit: '1',
});

/** Gmail API latency */
export const gmailLatency: Histogram = meter.createHistogram('gmail_api_duration_seconds', {
  description: 'Gmail API call duration in seconds',
  unit: 's',
  advice: {
    explicitBucketBoundaries: [0.1, 0.25, 0.5, 1, 2, 5, 10],
  },
});

/** Active Gmail watches */
export const activeWatches: UpDownCounter = meter.createUpDownCounter('gmail_active_watches', {
  description: 'Number of active Gmail watches',
  unit: '1',
});

// =============================================================================
// External Service Metrics - S3
// =============================================================================

/** S3 upload calls */
export const s3UploadsTotal: Counter = meter.createCounter('s3_uploads_total', {
  description: 'Total S3 upload operations',
  unit: '1',
});

/** S3 upload duration */
export const s3UploadDuration: Histogram = meter.createHistogram('s3_upload_duration_seconds', {
  description: 'S3 upload duration in seconds',
  unit: 's',
  advice: {
    explicitBucketBoundaries: [0.1, 0.5, 1, 2, 5, 10],
  },
});

// =============================================================================
// External Service Metrics - Gemini AI
// =============================================================================

/** Gemini API calls */
export const geminiCallsTotal: Counter = meter.createCounter('gemini_api_calls_total', {
  description: 'Total Gemini AI API calls',
  unit: '1',
});

/** Gemini API errors */
export const geminiErrorsTotal: Counter = meter.createCounter('gemini_api_errors_total', {
  description: 'Total Gemini AI API errors',
  unit: '1',
});

/** Gemini tokens used */
export const geminiTokensUsed: Counter = meter.createCounter('gemini_tokens_used_total', {
  description: 'Total tokens used by Gemini AI',
  unit: '1',
});

// =============================================================================
// Database Metrics
// =============================================================================

/** Database queries */
export const dbQueriesTotal: Counter = meter.createCounter('db_queries_total', {
  description: 'Total database queries',
  unit: '1',
});

/** Database query duration */
export const dbQueryDuration: Histogram = meter.createHistogram('db_query_duration_seconds', {
  description: 'Database query duration in seconds',
  unit: 's',
  advice: {
    explicitBucketBoundaries: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  },
});

// =============================================================================
// HTTP Metrics
// =============================================================================

/** HTTP requests total */
export const httpRequestsTotal: Counter = meter.createCounter('http_requests_total', {
  description: 'Total HTTP requests',
  unit: '1',
});

/** HTTP request duration */
export const httpRequestDuration: Histogram = meter.createHistogram('http_request_duration_seconds', {
  description: 'HTTP request duration in seconds',
  unit: 's',
  advice: {
    explicitBucketBoundaries: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  },
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Record a timed operation
 */
export function recordDuration(histogram: Histogram, startTime: number, attributes?: Record<string, string>) {
  const duration = (Date.now() - startTime) / 1000; // Convert to seconds
  histogram.record(duration, attributes);
}

/**
 * Start metrics server (Prometheus endpoint)
 * Initializes all counters with 0 so they appear in Prometheus immediately
 */
export function startMetricsServer() {
  console.log(`📊 Metrics available at http://localhost:${prometheusPort}/metrics`);
  
  // Initialize counters with 0 so they appear in Prometheus scrapes immediately
  // Without this, counters only appear after their first increment
  emailsProcessedTotal.add(0);
  documentsExtractedTotal.add(0);
  emailsSkippedTotal.add(0);
  duplicatesPreventedTotal.add(0);
  processingErrorsTotal.add(0);
  pubsubNotificationsTotal.add(0);
  textractCallsTotal.add(0);
  textractErrorsTotal.add(0);
  gmailCallsTotal.add(0);
  gmailErrorsTotal.add(0);
  s3UploadsTotal.add(0);
  geminiCallsTotal.add(0);
  geminiErrorsTotal.add(0);
  geminiTokensUsed.add(0);
  dbQueriesTotal.add(0);
  httpRequestsTotal.add(0);
}

/**
 * Shutdown metrics gracefully
 */
export async function shutdownMetrics() {
  await meterProvider.shutdown();
}

export { meter, meterProvider };
