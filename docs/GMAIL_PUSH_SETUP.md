# Gmail Push Notifications Setup Guide

This guide explains how to configure Gmail Push Notifications using Google Cloud Pub/Sub to automatically process emails in real-time.

## Overview

```
┌─────────┐      ┌─────────────┐      ┌────────────┐      ┌──────────┐
│  Gmail  │ ───► │  Pub/Sub    │ ───► │  Webhook   │ ───► │ Process  │
│  Inbox  │      │  Topic      │      │  Endpoint  │      │ Emails   │
└─────────┘      └─────────────┘      └────────────┘      └──────────┘
```

When a new email arrives, Gmail sends a notification to Pub/Sub, which then calls your webhook endpoint to trigger email processing.

## Prerequisites

- Google Cloud Project (can be the same one used for Gmail OAuth)
- Gmail API enabled
- Pub/Sub API enabled
- A public URL for your webhook (for production)

## Step 1: Enable Pub/Sub API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Go to **APIs & Services** > **Library**
4. Search for "Cloud Pub/Sub API"
5. Click **Enable**

## Step 2: Create Pub/Sub Topic

1. Go to **Pub/Sub** > **Topics**
2. Click **Create Topic**
3. Set the Topic ID to: `gmail-notifications`
4. Click **Create**

Your topic name will be: `projects/YOUR_PROJECT_ID/topics/gmail-notifications`

## Step 3: Grant Gmail Permission to Publish

Gmail needs permission to publish messages to your topic.

1. Go to your topic in Pub/Sub
2. Click on the **Permissions** tab
3. Click **Add Principal**
4. In "New principals", enter: `gmail-api-push@system.gserviceaccount.com`
5. In "Select a role", choose: **Pub/Sub Publisher**
6. Click **Save**

## Step 4: Create Push Subscription

1. In your topic, go to **Subscriptions** tab
2. Click **Create Subscription**
3. Configure:
   - **Subscription ID**: `gmail-push-subscription`
   - **Delivery type**: Push
   - **Endpoint URL**: `https://your-domain.com/api/webhook/gmail`
   - **Acknowledgement deadline**: 10 seconds
4. Click **Create**

> **Note**: For local development, use ngrok to expose your localhost:
> ```bash
> ngrok http 3000
> ```
> Then use the ngrok URL as your endpoint.

## Step 5: Configure Environment Variables

Add these to your `.env` file:

```bash
# Google Cloud Pub/Sub
GOOGLE_CLOUD_PROJECT_ID=your-project-id
PUBSUB_TOPIC_NAME=gmail-notifications

# Backend URL (your production URL)
BACKEND_URL=https://your-domain.com
```

## Step 6: Apply Database Migration

Run the Prisma migration to add the new fields:

```bash
npx prisma db push
# or
npx prisma migrate dev --name add-gmail-watch-fields
```

## Step 7: Start Watching Gmail

After a user connects their Gmail, start watching for new emails:

### Via API

```bash
# Start watching
curl -X POST http://localhost:3000/api/gmail/watch/start \
  -H "Content-Type: application/json" \
  -d '{"userId": "USER_ID"}'

# Check status
curl "http://localhost:3000/api/gmail/watch/status?userId=USER_ID"
```

### Automatic on Gmail Connect

Optionally, modify the Gmail OAuth callback to automatically start watching:

```typescript
// In /api/auth/gmail/callback
// After saving tokens...
const watchService = getGmailWatchService();
await watchService.startWatch(userId);
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/webhook/gmail` | POST | Pub/Sub webhook (called by Google) |
| `/api/gmail/watch/start` | POST | Start watching a user's inbox |
| `/api/gmail/watch/stop` | POST | Stop watching a user's inbox |
| `/api/gmail/watch/status` | GET | Get watch status for a user |
| `/api/gmail/watch/renew-all` | POST | Renew all expiring watches |
| `/api/gmail/watch/list` | GET | List all active watches |

## Watch Expiration

Gmail watches expire after **7 days**. The server automatically renews watches:

- **Automatic**: A background job runs every 12 hours to renew watches expiring within 48 hours
- **Manual**: Call `POST /api/gmail/watch/renew-all` via cron job

### External Cron Job (Recommended for Production)

Set up a cron job to call the renewal endpoint daily:

```bash
# Daily at 3:00 AM
0 3 * * * curl -X POST https://your-domain.com/api/gmail/watch/renew-all
```

Or use your cloud provider's cron service (Railway Cron, Vercel Cron, etc.)

## Troubleshooting

### Webhook Not Receiving Notifications

1. Check Pub/Sub subscription is active
2. Verify endpoint URL is correct and accessible
3. Check server logs for errors
4. Ensure SSL certificate is valid (HTTPS required in production)

### Watch Start Fails

1. Verify Gmail is connected for the user
2. Check Pub/Sub topic name is correct
3. Ensure `gmail-api-push@system.gserviceaccount.com` has Publisher role

### Duplicate Processing

The system uses `gmailHistoryId` to track processed emails. If you see duplicates:

1. Check the user's `gmailHistoryId` in the database
2. Clear it to force a full reprocess: 
   ```sql
   UPDATE users SET gmail_history_id = NULL WHERE id = 'USER_ID';
   ```

## Testing Locally

1. Install ngrok: `npm install -g ngrok`
2. Start ngrok: `ngrok http 3000`
3. Update Pub/Sub subscription endpoint to ngrok URL
4. Start your server: `npm run server`
5. Send yourself an email with an attachment
6. Check server logs for webhook activity

## Security Considerations

- The webhook endpoint is public - consider adding verification
- Pub/Sub messages are signed, you can verify them using Google's libraries
- Consider rate limiting the webhook endpoint
- Use HTTPS in production
