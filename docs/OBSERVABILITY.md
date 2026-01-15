# Observability Guide

This document explains how to use the observability features in Email Document Extractor.

## Quick Start

### 1. Start Observability Stack (Docker)

```bash
# Start Prometheus, Grafana, Jaeger, and Loki
docker-compose -f docker-compose.observability.yml up -d
```

### 2. Start the Application

```bash
# Terminal 1: Start server (API + webhook)
npm run server

# Terminal 2: Start worker (queue processing)
npm run worker

# With distributed tracing enabled
npm run server:traced
```

> **Importante**: El worker es necesario para procesar los emails. Sin él, los jobs se encolan pero no se procesan.

### 3. Access Dashboards

| Service | URL | Credentials |
|---------|-----|-------------|
| Grafana | http://localhost:3002 | admin / admin |
| Prometheus | http://localhost:9090 | - |
| Jaeger UI | http://localhost:16686 | - |
| Bull Board | http://localhost:3000/admin/queues | - |
| Server Metrics | http://localhost:9464/metrics | - |
| Worker Metrics | http://localhost:9465/metrics | - |

> **Nota**: El server y worker exponen métricas en puertos separados. Prometheus scrapea ambos y Grafana los muestra combinados usando `sum()`.

---

## Three Pillars of Observability

### 1. Logging (Pino)

Structured JSON logging with context correlation.

**Log Levels:**
- `error` - Errors that need attention
- `warn` - Warnings (e.g., failed to mark email as read)
- `info` - Important events (email processed, webhook received)
- `debug` - Detailed debugging info

**Configuration:**
```bash
# Set log level
LOG_LEVEL=debug npm run server

# Production (JSON output)
NODE_ENV=production npm run server
```

**Example Log Output:**
```json
{
  "level": "info",
  "time": "2026-01-15T12:00:00.000Z",
  "service": "email-doc-extractor",
  "component": "webhook",
  "action": "webhook_completed",
  "email": "user@example.com",
  "messagesProcessed": 1,
  "documentsExtracted": 3,
  "duration": 45000,
  "msg": "Webhook completed: 1 messages, 3 docs in 45000ms"
}
```

### 2. Metrics (OpenTelemetry + Prometheus)

Exposed at `http://localhost:9464/metrics`

**Business Metrics:**
| Metric | Type | Description |
|--------|------|-------------|
| `emails_processed_total` | Counter | Total emails processed |
| `documents_extracted_total` | Counter | Total documents extracted |
| `emails_skipped_total` | Counter | Already processed emails skipped |
| `duplicates_prevented_total` | Counter | Duplicates prevented by lock |
| `processing_errors_total` | Counter | Processing errors |
| `pubsub_notifications_total` | Counter | Pub/Sub notifications received |
| `webhook_duration_seconds` | Histogram | Webhook processing time |

**External Service Metrics:**
| Metric | Type | Description |
|--------|------|-------------|
| `textract_calls_total` | Counter | Textract API calls |
| `textract_duration_seconds` | Histogram | Textract processing time |
| `gmail_api_calls_total` | Counter | Gmail API calls |
| `gmail_api_duration_seconds` | Histogram | Gmail API latency |
| `s3_uploads_total` | Counter | S3 uploads |
| `gemini_api_calls_total` | Counter | Gemini AI calls |

**HTTP Metrics:**
| Metric | Type | Description |
|--------|------|-------------|
| `http_requests_total` | Counter | Total HTTP requests |
| `http_request_duration_seconds` | Histogram | Request latency |

### 3. Tracing (OpenTelemetry + Jaeger)

Distributed tracing across services.

**Enable Tracing:**
```bash
# Set environment variables
ENABLE_TRACING=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces

# Or use the traced script
npm run server:traced
```

**View Traces:**
1. Open Jaeger UI: http://localhost:16686
2. Select service: `email-doc-extractor`
3. Click "Find Traces"

---

## Grafana Dashboards

### Pre-configured Dashboard

The "Email Document Extractor - Overview" dashboard includes:

1. **Summary Stats**
   - Total emails processed
   - Total documents extracted
   - Processing errors
   - Pub/Sub notifications

2. **Processing Rate**
   - Emails/minute
   - Documents/minute

3. **Latency**
   - Webhook duration (p50, p95, p99)
   - HTTP request duration

4. **HTTP Requests**
   - Requests by status code

### Creating Custom Dashboards

1. Go to Grafana (http://localhost:3002)
2. Click "+" → "New Dashboard"
3. Add panels using Prometheus queries

**Example Queries:**
```promql
# Error rate (last 5 min)
rate(processing_errors_total[5m])

# Average webhook duration
histogram_quantile(0.95, rate(webhook_duration_seconds_bucket[5m]))

# Documents per hour
increase(documents_extracted_total[1h])
```

---

## Alerting

### Prometheus Alerting Rules

Create `observability/prometheus/alerts.yml`:

```yaml
groups:
  - name: email-extractor
    rules:
      - alert: HighErrorRate
        expr: rate(processing_errors_total[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: High error rate in email processing

      - alert: SlowWebhook
        expr: histogram_quantile(0.95, rate(webhook_duration_seconds_bucket[5m])) > 60
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: Webhook processing taking too long
```

### Grafana Alerting

1. Go to Alerting → Alert rules
2. Create new alert rule
3. Set condition (e.g., `processing_errors_total > 10`)
4. Configure notification channel

---

## Production Recommendations

### 1. Use Managed Services

Consider using managed observability services:
- **Grafana Cloud** - Free tier includes 10k metrics
- **AWS CloudWatch** - Native AWS integration
- **Datadog** - All-in-one solution
- **New Relic** - Generous free tier

### 2. Log Aggregation

For production, ship logs to a central location:
- Configure Pino to output JSON
- Use Promtail/Fluentd to ship to Loki/Elasticsearch

### 3. Retention Policies

Set appropriate retention:
- Metrics: 15-30 days
- Logs: 7-30 days
- Traces: 7 days

### 4. Security

- Use authentication for Grafana
- Restrict access to metrics endpoint
- Don't expose Jaeger publicly

---

## Troubleshooting

### Metrics not showing in Prometheus

1. Check app is exposing metrics: `curl http://localhost:9464/metrics`
2. Verify Prometheus config targets
3. Check Prometheus UI → Status → Targets

### Traces not appearing in Jaeger

1. Ensure `ENABLE_TRACING=true`
2. Check OTLP endpoint is reachable
3. Verify Jaeger is running: `docker logs observability-jaeger`

### Logs not structured

1. Check `NODE_ENV` is set to `production` for JSON output
2. Verify pino-pretty is not enabled in production

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` (prod) / `debug` (dev) | Logging level |
| `NODE_ENV` | `development` | Environment mode |
| `ENABLE_TRACING` | `false` | Enable distributed tracing |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318/v1/traces` | OTLP endpoint |
| `PROMETHEUS_PORT` | `9464` | Server metrics port |
| `WORKER_METRICS_PORT` | `9465` | Worker metrics port |
| `REDIS_HOST` | `localhost` | Redis host for BullMQ |
| `REDIS_PORT` | `6379` | Redis port |
| `EMAIL_WORKER_CONCURRENCY` | `2` | Parallel email jobs |
| `ATTACHMENT_WORKER_CONCURRENCY` | `3` | Parallel attachment jobs |
