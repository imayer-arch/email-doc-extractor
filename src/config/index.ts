import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const config = {
  // Database
  database: {
    url: process.env.DATABASE_URL || '',
  },

  // AWS Textract & S3
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    region: process.env.AWS_REGION || 'us-east-2',
    s3Bucket: process.env.AWS_S3_BUCKET || '',
  },

  // Gmail OAuth2
  gmail: {
    clientId: process.env.GMAIL_CLIENT_ID || '',
    clientSecret: process.env.GMAIL_CLIENT_SECRET || '',
    redirectUri: process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000/oauth/callback',
    refreshToken: process.env.GMAIL_REFRESH_TOKEN || '',
    userEmail: process.env.GMAIL_USER_EMAIL || '',
  },

  // Email notifications (AWS SES or SMTP)
  email: {
    provider: (process.env.EMAIL_PROVIDER || 'ses') as 'ses' | 'smtp',
    fromEmail: process.env.EMAIL_FROM || process.env.GMAIL_USER_EMAIL || '',
    notificationEmail: process.env.NOTIFICATION_EMAIL || '',
    // AWS SES config (uses same credentials as aws.*)
    ses: {
      region: process.env.AWS_SES_REGION || process.env.AWS_REGION || 'us-east-2',
    },
    // SMTP config (legacy, optional)
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  },

  // Agent settings
  agent: {
    pollingIntervalMs: parseInt(process.env.POLLING_INTERVAL_MS || '60000', 10),
    // ADK looks for GOOGLE_GENAI_API_KEY or GEMINI_API_KEY
    googleApiKey: process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
  },

  // Gmail Push Notifications (Pub/Sub)
  pubsub: {
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || '',
    topicName: process.env.PUBSUB_TOPIC_NAME || 'gmail-notifications',
    // Full topic path: projects/{projectId}/topics/{topicName}
    get topicPath() {
      return `projects/${this.projectId}/topics/${this.topicName}`;
    },
  },

  // Server settings
  server: {
    backendUrl: process.env.BACKEND_URL || 'http://localhost:3000',
    port: parseInt(process.env.BACKEND_PORT || '3000', 10),
  },
} as const;

// Validate required configuration
export function validateConfig(): void {
  const required = [
    ['DATABASE_URL', config.database.url],
    ['AWS_ACCESS_KEY_ID', config.aws.accessKeyId],
    ['AWS_SECRET_ACCESS_KEY', config.aws.secretAccessKey],
    ['GMAIL_CLIENT_ID', config.gmail.clientId],
    ['GMAIL_CLIENT_SECRET', config.gmail.clientSecret],
    ['GMAIL_REFRESH_TOKEN', config.gmail.refreshToken],
    ['GOOGLE_GENAI_API_KEY', config.agent.googleApiKey],
  ];

  const missing = required.filter(([_, value]) => !value).map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Setup environment for ADK (copies key to expected variable name)
export function setupAdkEnvironment(): void {
  if (!process.env.GOOGLE_GENAI_API_KEY && config.agent.googleApiKey) {
    process.env.GOOGLE_GENAI_API_KEY = config.agent.googleApiKey;
  }
}
