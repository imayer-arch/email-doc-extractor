/**
 * Distributed Tracing - OpenTelemetry
 * Traces requests across services for debugging and performance analysis
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { trace, context, SpanStatusCode, Span, SpanKind } from '@opentelemetry/api';
import { loggers } from './logger';

const log = loggers.server;

// OTLP endpoint (Jaeger, Tempo, or any OTLP-compatible backend)
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';

// Service resource attributes
const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: 'email-doc-extractor',
  [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
  'deployment.environment': process.env.NODE_ENV || 'development',
});

// Configure OTLP exporter
const traceExporter = new OTLPTraceExporter({
  url: otlpEndpoint,
});

// Create SDK with auto-instrumentation
const sdk = new NodeSDK({
  resource,
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      // Disable noisy instrumentations
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
      // Configure HTTP instrumentation
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingRequestHook: (req) => {
          const url = req.url || '';
          return url === '/api/health' || url === '/favicon.ico' || url === '/metrics';
        },
      },
    }),
  ],
});

// Get tracer for manual spans
const tracer = trace.getTracer('email-doc-extractor', '1.0.0');

/**
 * Start the OpenTelemetry SDK
 * IMPORTANT: Must be called BEFORE any other imports
 */
export function startTracing() {
  try {
    sdk.start();
    log.info({ action: 'tracing_started', endpoint: otlpEndpoint }, 'OpenTelemetry tracing started');
    console.log(`🔍 Tracing enabled (OTLP endpoint: ${otlpEndpoint})`);
  } catch (error) {
    log.warn({ action: 'tracing_disabled', error }, 'Failed to start tracing - continuing without it');
  }
}

/**
 * Shutdown tracing gracefully
 */
export async function shutdownTracing() {
  try {
    await sdk.shutdown();
    log.info({ action: 'tracing_shutdown' }, 'OpenTelemetry tracing shut down');
  } catch (error) {
    log.error({ action: 'tracing_shutdown_error', error }, 'Error shutting down tracing');
  }
}

/**
 * Create a span for a specific operation
 */
export function createSpan(name: string, fn: (span: Span) => Promise<void> | void): Promise<void> {
  return tracer.startActiveSpan(name, async (span) => {
    try {
      await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Create a span with return value
 */
export function createSpanWithResult<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Add attributes to the current span
 */
export function addSpanAttributes(attributes: Record<string, string | number | boolean>) {
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttributes(attributes);
  }
}

/**
 * Record an event on the current span
 */
export function recordSpanEvent(name: string, attributes?: Record<string, string | number | boolean>) {
  const span = trace.getActiveSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

/**
 * Get current trace ID for logging correlation
 */
export function getCurrentTraceId(): string | undefined {
  const span = trace.getActiveSpan();
  if (span) {
    return span.spanContext().traceId;
  }
  return undefined;
}

/**
 * Get current span ID for logging correlation
 */
export function getCurrentSpanId(): string | undefined {
  const span = trace.getActiveSpan();
  if (span) {
    return span.spanContext().spanId;
  }
  return undefined;
}

// Span name constants for consistency
export const SpanNames = {
  // Webhook
  WEBHOOK_RECEIVE: 'webhook.receive',
  WEBHOOK_PROCESS: 'webhook.process',
  
  // Email Processing
  EMAIL_FETCH: 'email.fetch',
  EMAIL_PROCESS: 'email.process',
  EMAIL_MARK_READ: 'email.markRead',
  
  // Gmail
  GMAIL_LIST_MESSAGES: 'gmail.listMessages',
  GMAIL_GET_MESSAGE: 'gmail.getMessage',
  GMAIL_GET_ATTACHMENT: 'gmail.getAttachment',
  GMAIL_MODIFY: 'gmail.modify',
  
  // Textract
  TEXTRACT_UPLOAD_S3: 'textract.uploadS3',
  TEXTRACT_START_JOB: 'textract.startJob',
  TEXTRACT_WAIT_JOB: 'textract.waitJob',
  TEXTRACT_GET_RESULTS: 'textract.getResults',
  TEXTRACT_CLEANUP_S3: 'textract.cleanupS3',
  
  // Database
  DB_SAVE_DOCUMENT: 'db.saveDocument',
  DB_QUERY: 'db.query',
  DB_UPDATE: 'db.update',
  
  // Gemini
  GEMINI_CHAT: 'gemini.chat',
  GEMINI_GENERATE: 'gemini.generate',
} as const;

export { tracer, trace, context, SpanStatusCode, SpanKind };
