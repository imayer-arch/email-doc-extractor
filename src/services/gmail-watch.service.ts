/**
 * Gmail Watch Service - Push Notifications via Pub/Sub
 * Manages Gmail watch subscriptions for real-time email notifications
 */

import { google, gmail_v1 } from 'googleapis';
import { PrismaClient } from '@prisma/client';
import { config } from '../config';
import { GmailService } from './gmail.service';
import { decrypt } from '../utils/crypto';

const prisma = new PrismaClient();

export interface WatchResponse {
  historyId: string;
  expiration: string;
}

export interface GmailNotification {
  emailAddress: string;
  historyId: string;
}

export class GmailWatchService {
  /**
   * Start watching a user's Gmail inbox for new messages
   * This sets up push notifications via Google Cloud Pub/Sub
   */
  async startWatch(userId: string): Promise<WatchResponse> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        gmailConnected: true,
        gmailRefreshToken: true,
      },
    });

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    if (!user.gmailConnected || !user.gmailRefreshToken) {
      throw new Error(`Gmail not connected for user: ${user.email}`);
    }

    // Create OAuth2 client with user's tokens
    const oauth2Client = new google.auth.OAuth2(
      config.gmail.clientId,
      config.gmail.clientSecret,
      config.gmail.redirectUri
    );

    oauth2Client.setCredentials({
      refresh_token: decrypt(user.gmailRefreshToken),
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Start watching the inbox
    const response = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        topicName: config.pubsub.topicPath,
        labelIds: ['INBOX'],
        labelFilterBehavior: 'INCLUDE',
      },
    });

    if (!response.data.historyId || !response.data.expiration) {
      throw new Error('Invalid watch response from Gmail API');
    }

    // Save watch info to database
    await prisma.user.update({
      where: { id: userId },
      data: {
        gmailHistoryId: response.data.historyId,
        gmailWatchExpiry: new Date(parseInt(response.data.expiration)),
      },
    });

    console.log(`[GmailWatch] Started watch for user: ${user.email}`);
    console.log(`  historyId: ${response.data.historyId}`);
    console.log(`  expiration: ${new Date(parseInt(response.data.expiration)).toISOString()}`);

    return {
      historyId: response.data.historyId,
      expiration: response.data.expiration,
    };
  }

  /**
   * Stop watching a user's Gmail inbox
   */
  async stopWatch(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        gmailConnected: true,
        gmailRefreshToken: true,
      },
    });

    if (!user || !user.gmailConnected || !user.gmailRefreshToken) {
      console.log(`[GmailWatch] Cannot stop watch - user not found or Gmail not connected`);
      return;
    }

    const oauth2Client = new google.auth.OAuth2(
      config.gmail.clientId,
      config.gmail.clientSecret,
      config.gmail.redirectUri
    );

    oauth2Client.setCredentials({
      refresh_token: decrypt(user.gmailRefreshToken),
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    try {
      await gmail.users.stop({ userId: 'me' });
      console.log(`[GmailWatch] Stopped watch for user: ${user.email}`);
    } catch (error) {
      // Ignore errors when stopping - might not be active
      console.log(`[GmailWatch] Stop watch error (may be already stopped):`, error);
    }

    // Clear watch info from database
    await prisma.user.update({
      where: { id: userId },
      data: {
        gmailHistoryId: null,
        gmailWatchExpiry: null,
      },
    });
  }

  /**
   * Renew a user's Gmail watch (must be done before expiration)
   * Gmail watches expire after 7 days
   */
  async renewWatch(userId: string): Promise<WatchResponse> {
    console.log(`[GmailWatch] Renewing watch for user: ${userId}`);
    
    // Stop current watch first
    await this.stopWatch(userId);
    
    // Start a new watch
    return this.startWatch(userId);
  }

  /**
   * Renew all watches that are about to expire
   * Should be called periodically (e.g., daily via cron)
   */
  async renewExpiringWatches(hoursBeforeExpiry: number = 24): Promise<{ renewed: number; errors: string[] }> {
    const expiryThreshold = new Date(Date.now() + hoursBeforeExpiry * 60 * 60 * 1000);
    
    const usersToRenew = await prisma.user.findMany({
      where: {
        gmailConnected: true,
        gmailWatchExpiry: {
          lt: expiryThreshold,
        },
      },
      select: {
        id: true,
        email: true,
      },
    });

    console.log(`[GmailWatch] Found ${usersToRenew.length} watches to renew`);

    let renewed = 0;
    const errors: string[] = [];

    for (const user of usersToRenew) {
      try {
        await this.renewWatch(user.id);
        renewed++;
      } catch (error) {
        const errorMsg = `Failed to renew watch for ${user.email}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(`[GmailWatch] ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    console.log(`[GmailWatch] Renewed ${renewed} watches, ${errors.length} errors`);
    return { renewed, errors };
  }

  /**
   * Get watch status for a user
   */
  async getWatchStatus(userId: string): Promise<{
    active: boolean;
    historyId: string | null;
    expiresAt: Date | null;
    expiresIn: string | null;
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        gmailHistoryId: true,
        gmailWatchExpiry: true,
      },
    });

    if (!user || !user.gmailWatchExpiry) {
      return {
        active: false,
        historyId: null,
        expiresAt: null,
        expiresIn: null,
      };
    }

    const now = new Date();
    const expiresAt = user.gmailWatchExpiry;
    const active = expiresAt > now;
    
    let expiresIn: string | null = null;
    if (active) {
      const diffMs = expiresAt.getTime() - now.getTime();
      const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
      const diffHours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      expiresIn = `${diffDays}d ${diffHours}h`;
    }

    return {
      active,
      historyId: user.gmailHistoryId,
      expiresAt,
      expiresIn,
    };
  }

  /**
   * Get all users with active watches
   */
  async getActiveWatches(): Promise<Array<{
    userId: string;
    email: string;
    historyId: string | null;
    expiresAt: Date | null;
  }>> {
    const users = await prisma.user.findMany({
      where: {
        gmailConnected: true,
        gmailWatchExpiry: {
          gt: new Date(),
        },
      },
      select: {
        id: true,
        email: true,
        gmailHistoryId: true,
        gmailWatchExpiry: true,
      },
    });

    return users.map(u => ({
      userId: u.id,
      email: u.email,
      historyId: u.gmailHistoryId,
      expiresAt: u.gmailWatchExpiry,
    }));
  }
}

// Singleton instance
let gmailWatchServiceInstance: GmailWatchService | null = null;

export function getGmailWatchService(): GmailWatchService {
  if (!gmailWatchServiceInstance) {
    gmailWatchServiceInstance = new GmailWatchService();
  }
  return gmailWatchServiceInstance;
}
