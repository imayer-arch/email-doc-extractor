/**
 * Instrumentation Bootstrap
 * This file must be loaded BEFORE any other code to enable auto-instrumentation
 * 
 * Usage:
 *   NODE_OPTIONS='--require ./dist/instrumentation.js' node dist/server.js
 *   or
 *   ts-node -r ./src/instrumentation.ts src/server.ts
 */

import { startTracing } from './lib/tracing';

// Start tracing immediately
if (process.env.ENABLE_TRACING === 'true') {
  startTracing();
} else {
  console.log('🔍 Tracing disabled (set ENABLE_TRACING=true to enable)');
}
