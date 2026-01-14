/**
 * Gmail OAuth Setup Script
 * This script helps you obtain the refresh token needed for Gmail API access.
 * 
 * Prerequisites:
 * 1. Create a project in Google Cloud Console
 * 2. Enable Gmail API
 * 3. Create OAuth 2.0 credentials (Desktop App type)
 * 4. Download the credentials and set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET
 * 
 * Run with: npx ts-node src/scripts/setup-gmail-oauth.ts
 */

import { google } from 'googleapis';
import * as http from 'http';
import * as url from 'url';
import { config } from '../config';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.labels',
];

async function main() {
  console.log('========================================');
  console.log('  Gmail OAuth Setup');
  console.log('========================================\n');

  if (!config.gmail.clientId || !config.gmail.clientSecret) {
    console.error('Error: GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set in .env');
    console.log('\nSteps to get credentials:');
    console.log('1. Go to https://console.cloud.google.com/');
    console.log('2. Create a new project or select existing');
    console.log('3. Enable Gmail API');
    console.log('4. Go to Credentials > Create Credentials > OAuth client ID');
    console.log('5. Select "Desktop app" as application type');
    console.log('6. Download JSON and copy Client ID and Client Secret to .env');
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(
    config.gmail.clientId,
    config.gmail.clientSecret,
    'http://localhost:3000/oauth/callback'
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force consent to get refresh token
  });

  console.log('Please visit this URL to authorize the application:\n');
  console.log(authUrl);
  console.log('\nWaiting for authorization...\n');

  // Start a local server to receive the callback
  const server = http.createServer(async (req, res) => {
    if (req.url?.startsWith('/oauth/callback')) {
      const parsedUrl = url.parse(req.url, true);
      const code = parsedUrl.query.code as string;

      if (code) {
        try {
          const { tokens } = await oauth2Client.getToken(code);
          
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: Arial; padding: 20px;">
                <h1>✓ Authorization Successful!</h1>
                <p>You can close this window now.</p>
                <p>Check your terminal for the refresh token.</p>
              </body>
            </html>
          `);

          console.log('========================================');
          console.log('  Authorization Successful!');
          console.log('========================================\n');
          
          console.log('Add this to your .env file:\n');
          console.log(`GMAIL_REFRESH_TOKEN="${tokens.refresh_token}"`);
          console.log();

          if (tokens.access_token) {
            console.log('Access Token (for testing, expires soon):');
            console.log(tokens.access_token.substring(0, 50) + '...\n');
          }

          server.close();
          process.exit(0);
        } catch (error) {
          console.error('Error getting tokens:', error);
          res.writeHead(500);
          res.end('Error getting tokens');
          server.close();
          process.exit(1);
        }
      } else {
        res.writeHead(400);
        res.end('No authorization code received');
      }
    }
  });

  server.listen(3000, () => {
    console.log('Listening on http://localhost:3000 for OAuth callback...');
  });
}

main().catch(console.error);
