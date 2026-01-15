/**
 * Metrics Middleware
 * Automatically tracks HTTP request metrics
 */

import { Request, Response, NextFunction } from 'express';
import { httpRequestsTotal, httpRequestDuration, recordDuration } from '../lib/metrics';

/**
 * Middleware to track HTTP request metrics
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  
  // Track when response finishes
  res.on('finish', () => {
    const method = req.method;
    const route = req.route?.path || req.path;
    const statusCode = res.statusCode.toString();
    const statusClass = `${Math.floor(res.statusCode / 100)}xx`;
    
    const attributes = {
      method,
      route,
      status_code: statusCode,
      status_class: statusClass,
    };
    
    // Increment request counter
    httpRequestsTotal.add(1, attributes);
    
    // Record duration
    recordDuration(httpRequestDuration, startTime, attributes);
  });
  
  next();
}

export default metricsMiddleware;
