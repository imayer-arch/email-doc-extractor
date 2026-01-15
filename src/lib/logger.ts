/**
 * Centralized Logger - Pino
 * Structured logging with context and trace correlation
 */

import pino from 'pino';

// Determine if we're in development or production
const isDev = process.env.NODE_ENV !== 'production';

// Create base logger configuration
const loggerConfig: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  
  // Base context added to all logs
  base: {
    service: 'email-doc-extractor',
    version: process.env.npm_package_version || '1.0.0',
    env: process.env.NODE_ENV || 'development',
  },
  
  // Timestamp format
  timestamp: pino.stdTimeFunctions.isoTime,
  
  // Redact sensitive data
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'password',
      'refreshToken',
      'accessToken',
      'gmailRefreshToken',
      'gmailAccessToken',
      'apiKey',
      'secret',
    ],
    censor: '[REDACTED]',
  },
};

// In development, use pino-pretty for readable output
const transport = isDev
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname,service,version,env',
        messageFormat: '{msg}',
      },
    }
  : undefined;

// Create the base logger
export const logger = pino({
  ...loggerConfig,
  transport,
});

// Logger types for context
export interface LogContext {
  traceId?: string;
  spanId?: string;
  userId?: string;
  emailId?: string;
  requestId?: string;
  [key: string]: unknown;
}

/**
 * Create a child logger with additional context
 */
export function createLogger(context: LogContext) {
  return logger.child(context);
}

/**
 * Service-specific loggers
 */
export const loggers = {
  server: createLogger({ component: 'server' }),
  webhook: createLogger({ component: 'webhook' }),
  emailProcessor: createLogger({ component: 'email-processor' }),
  gmail: createLogger({ component: 'gmail' }),
  textract: createLogger({ component: 'textract' }),
  s3: createLogger({ component: 's3' }),
  database: createLogger({ component: 'database' }),
  auth: createLogger({ component: 'auth' }),
  gemini: createLogger({ component: 'gemini' }),
};

/**
 * Log helper for timing operations
 */
export function logDuration(
  log: pino.Logger,
  action: string,
  startTime: number,
  metadata?: Record<string, unknown>
) {
  const duration = Date.now() - startTime;
  log.info({ action, duration, ...metadata }, `${action} completed in ${duration}ms`);
}

/**
 * Structured error logging
 */
export function logError(
  log: pino.Logger,
  error: Error | unknown,
  context?: Record<string, unknown>
) {
  if (error instanceof Error) {
    log.error(
      {
        err: {
          message: error.message,
          name: error.name,
          stack: error.stack,
        },
        ...context,
      },
      error.message
    );
  } else {
    log.error({ err: error, ...context }, 'Unknown error occurred');
  }
}

export default logger;
