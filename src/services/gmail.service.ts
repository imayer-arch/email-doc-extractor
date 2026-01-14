import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config';

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  data: Buffer;
  size: number;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: Date;
  snippet: string;
  attachments: EmailAttachment[];
}

export class GmailService {
  private oauth2Client: OAuth2Client;
  private gmail: gmail_v1.Gmail;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      config.gmail.clientId,
      config.gmail.clientSecret,
      config.gmail.redirectUri
    );

    this.oauth2Client.setCredentials({
      refresh_token: config.gmail.refreshToken,
    });

    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
  }

  /**
   * Get unread emails with attachments
   */
  async getUnreadEmailsWithAttachments(): Promise<EmailMessage[]> {
    try {
      // Search for unread emails with attachments
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread has:attachment',
        maxResults: 10,
      });

      const messages = response.data.messages || [];
      const emails: EmailMessage[] = [];

      for (const message of messages) {
        if (message.id) {
          const email = await this.getEmailDetails(message.id);
          if (email && email.attachments.length > 0) {
            emails.push(email);
          }
        }
      }

      return emails;
    } catch (error) {
      console.error('Error fetching emails:', error);
      throw error;
    }
  }

  /**
   * Get full email details including attachments
   */
  async getEmailDetails(messageId: string): Promise<EmailMessage | null> {
    try {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      const message = response.data;
      const headers = message.payload?.headers || [];

      const getHeader = (name: string): string => {
        const header = headers.find(h => h.name?.toLowerCase() === name.toLowerCase());
        return header?.value || '';
      };

      const subject = getHeader('Subject');
      const from = getHeader('From');
      const dateStr = getHeader('Date');

      // Extract attachments
      const attachments = await this.extractAttachments(messageId, message.payload);

      // Filter only supported file types for Textract
      const supportedAttachments = attachments.filter(att => 
        this.isSupportedFileType(att.mimeType, att.filename)
      );

      return {
        id: messageId,
        threadId: message.threadId || '',
        subject,
        from,
        date: dateStr ? new Date(dateStr) : new Date(),
        snippet: message.snippet || '',
        attachments: supportedAttachments,
      };
    } catch (error) {
      console.error(`Error fetching email ${messageId}:`, error);
      return null;
    }
  }

  /**
   * Extract attachments from email payload
   */
  private async extractAttachments(
    messageId: string,
    payload: gmail_v1.Schema$MessagePart | undefined
  ): Promise<EmailAttachment[]> {
    const attachments: EmailAttachment[] = [];

    if (!payload) return attachments;

    const extractFromParts = async (parts: gmail_v1.Schema$MessagePart[] | undefined) => {
      if (!parts) return;

      for (const part of parts) {
        if (part.filename && part.body?.attachmentId) {
          // This is an attachment
          const attachmentData = await this.getAttachmentData(
            messageId,
            part.body.attachmentId
          );

          if (attachmentData) {
            attachments.push({
              filename: part.filename,
              mimeType: part.mimeType || 'application/octet-stream',
              data: attachmentData,
              size: part.body.size || 0,
            });
          }
        }

        // Recursively check nested parts
        if (part.parts) {
          await extractFromParts(part.parts);
        }
      }
    };

    // Check the main payload
    if (payload.filename && payload.body?.attachmentId) {
      const attachmentData = await this.getAttachmentData(
        messageId,
        payload.body.attachmentId
      );

      if (attachmentData) {
        attachments.push({
          filename: payload.filename,
          mimeType: payload.mimeType || 'application/octet-stream',
          data: attachmentData,
          size: payload.body.size || 0,
        });
      }
    }

    // Check parts
    await extractFromParts(payload.parts);

    return attachments;
  }

  /**
   * Get attachment data by ID
   */
  private async getAttachmentData(
    messageId: string,
    attachmentId: string
  ): Promise<Buffer | null> {
    try {
      const response = await this.gmail.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: attachmentId,
      });

      if (response.data.data) {
        // Gmail returns base64url encoded data
        return Buffer.from(response.data.data, 'base64url');
      }

      return null;
    } catch (error) {
      console.error(`Error fetching attachment ${attachmentId}:`, error);
      return null;
    }
  }

  /**
   * Check if file type is supported by Textract
   */
  private isSupportedFileType(mimeType: string, filename: string): boolean {
    const supportedMimeTypes = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/tiff',
    ];

    const supportedExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.tif'];

    const mimeSupported = supportedMimeTypes.includes(mimeType.toLowerCase());
    const extSupported = supportedExtensions.some(ext => 
      filename.toLowerCase().endsWith(ext)
    );

    return mimeSupported || extSupported;
  }

  /**
   * Mark email as read
   */
  async markAsRead(messageId: string): Promise<void> {
    try {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['UNREAD'],
        },
      });
    } catch (error) {
      console.error(`Error marking email ${messageId} as read:`, error);
      throw error;
    }
  }

  /**
   * Add a label to an email
   */
  async addLabel(messageId: string, labelName: string): Promise<void> {
    try {
      // First, get or create the label
      const labelsResponse = await this.gmail.users.labels.list({ userId: 'me' });
      let label = labelsResponse.data.labels?.find(l => l.name === labelName);

      if (!label) {
        const createResponse = await this.gmail.users.labels.create({
          userId: 'me',
          requestBody: {
            name: labelName,
            labelListVisibility: 'labelShow',
            messageListVisibility: 'show',
          },
        });
        label = createResponse.data;
      }

      if (label?.id) {
        await this.gmail.users.messages.modify({
          userId: 'me',
          id: messageId,
          requestBody: {
            addLabelIds: [label.id],
          },
        });
      }
    } catch (error) {
      console.error(`Error adding label to email ${messageId}:`, error);
      throw error;
    }
  }
}

// Singleton instance
let gmailServiceInstance: GmailService | null = null;

export function getGmailService(): GmailService {
  if (!gmailServiceInstance) {
    gmailServiceInstance = new GmailService();
  }
  return gmailServiceInstance;
}
