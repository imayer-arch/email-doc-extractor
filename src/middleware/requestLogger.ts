/**
 * Request Logger Middleware
 * Adds request ID and logs all HTTP requests with timing
 */

import { Request, Response, NextFunction } from 'express';
import pinoHttp from 'pino-http';
import { logger, createLogger } from '../lib/logger';
import { randomUUID } from 'crypto';

// Extend Express Request to include requestId
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      log: ReturnType<typeof createLogger>;
    }
  }
}

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return randomUUID().split('-')[0]; // Short ID like "a1b2c3d4"
}

/**
 * Request ID middleware - adds unique ID to each request
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  // Use existing request ID from header or generate new one
  const requestId = (req.headers['x-request-id'] as string) || generateRequestId();
  
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  
  // Create a child logger with request context
  req.log = createLogger({
    requestId,
    method: req.method,
    path: req.path,
  });
  
  next();
}

/**
 * Pino HTTP middleware for automatic request/response logging
 */
export const httpLogger = pinoHttp({
  logger,
  
  // Generate request ID
  genReqId: (req) => {
    return (req as Request).requestId || generateRequestId();
  },
  
  // Custom log level based on status code
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  
  // Custom success message
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
  
  // Custom error message
  customErrorMessage: (req, res, err) => {
    return `${req.method} ${req.url} ${res.statusCode} - ${err.message}`;
  },
  
  // Custom attributes to add to log
  customAttributeKeys: {
    req: 'request',
    res: 'response',
    err: 'error',
    responseTime: 'duration',
  },
  
  // Customize what to log from request
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      query: req.query,
      params: req.params,
      // Don't log body by default (can contain sensitive data)
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
  
  // Don't log health check endpoints (too noisy)
  autoLogging: {
    ignore: (req) => {
      const url = req.url || '';
      return url === '/api/health' || url === '/favicon.ico';
    },
  },
});

/**
 * Error logging middleware - must be last
 */
export function errorLogger(err: Error, req: Request, res: Response, next: NextFunction) {
  const log = req.log || logger;
  
  log.error(
    {
      err: {
        message: err.message,
        name: err.name,
        stack: err.stack,
      },
      requestId: req.requestId,
    },
    `Unhandled error: ${err.message}`
  );
  
  next(err);
}

export default httpLogger;
