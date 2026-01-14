import { z } from 'zod';
import { getGmailService, EmailMessage } from '../services/gmail.service';
import { getDatabaseService } from '../services/database.service';

/**
 * Gmail Tool Definition for ADK Agent
 * Allows the agent to check for new emails with attachments
 */
export const gmailToolDefinition = {
  name: 'checkEmails',
  description: `Check Gmail inbox for unread emails with attachments. 
    Returns a list of emails that have not been processed yet, including their 
    subject, sender, date, and attachment information. 
    Use this tool to discover new documents that need to be processed.`,
  parameters: z.object({
    maxResults: z.number().optional().default(10).describe('Maximum number of emails to return'),
  }),
};

/**
 * Gmail Tool Implementation
 */
export async function checkEmailsTool(params: { maxResults?: number }): Promise<{
  success: boolean;
  emails: Array<{
    id: string;
    subject: string;
    from: string;
    date: string;
    attachmentCount: number;
    attachments: Array<{ filename: string; mimeType: string; size: number }>;
  }>;
  message: string;
}> {
  try {
    const gmailService = getGmailService();
    const dbService = getDatabaseService();
    
    const emails = await gmailService.getUnreadEmailsWithAttachments();
    
    // Filter out already processed emails
    const unprocessedEmails: EmailMessage[] = [];
    for (const email of emails) {
      const isProcessed = await dbService.isEmailProcessed(email.id);
      if (!isProcessed) {
        unprocessedEmails.push(email);
      }
    }

    const limitedEmails = unprocessedEmails.slice(0, params.maxResults || 10);

    return {
      success: true,
      emails: limitedEmails.map(email => ({
        id: email.id,
        subject: email.subject,
        from: email.from,
        date: email.date.toISOString(),
        attachmentCount: email.attachments.length,
        attachments: email.attachments.map(att => ({
          filename: att.filename,
          mimeType: att.mimeType,
          size: att.size,
        })),
      })),
      message: `Found ${limitedEmails.length} unprocessed email(s) with attachments`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      emails: [],
      message: `Error checking emails: ${errorMessage}`,
    };
  }
}

/**
 * Get email attachment data tool definition
 */
export const getAttachmentToolDefinition = {
  name: 'getEmailAttachment',
  description: `Get the binary data of a specific attachment from an email. 
    This is needed before sending the document to Textract for extraction.
    Returns the attachment data as base64 encoded string.`,
  parameters: z.object({
    emailId: z.string().describe('The ID of the email containing the attachment'),
    attachmentFilename: z.string().describe('The filename of the attachment to retrieve'),
  }),
};

/**
 * Get attachment tool implementation
 */
export async function getEmailAttachmentTool(params: {
  emailId: string;
  attachmentFilename: string;
}): Promise<{
  success: boolean;
  data?: string;
  mimeType?: string;
  filename?: string;
  message: string;
}> {
  try {
    const gmailService = getGmailService();
    const email = await gmailService.getEmailDetails(params.emailId);

    if (!email) {
      return {
        success: false,
        message: `Email with ID ${params.emailId} not found`,
      };
    }

    const attachment = email.attachments.find(
      att => att.filename === params.attachmentFilename
    );

    if (!attachment) {
      return {
        success: false,
        message: `Attachment ${params.attachmentFilename} not found in email`,
      };
    }

    return {
      success: true,
      data: attachment.data.toString('base64'),
      mimeType: attachment.mimeType,
      filename: attachment.filename,
      message: `Successfully retrieved attachment: ${attachment.filename}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `Error getting attachment: ${errorMessage}`,
    };
  }
}

/**
 * Mark email as processed tool definition
 */
export const markEmailProcessedToolDefinition = {
  name: 'markEmailProcessed',
  description: `Mark an email as processed after all its attachments have been extracted.
    This prevents the email from being processed again in future runs.`,
  parameters: z.object({
    emailId: z.string().describe('The ID of the email to mark as processed'),
    markAsRead: z.boolean().optional().default(true).describe('Whether to also mark the email as read in Gmail'),
  }),
};

/**
 * Mark email processed implementation
 */
export async function markEmailProcessedTool(params: {
  emailId: string;
  markAsRead?: boolean;
}): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const gmailService = getGmailService();
    const dbService = getDatabaseService();

    // Mark as processed in database
    await dbService.markEmailProcessed(params.emailId);

    // Optionally mark as read in Gmail
    if (params.markAsRead !== false) {
      await gmailService.markAsRead(params.emailId);
      await gmailService.addLabel(params.emailId, 'Processed-By-AI');
    }

    return {
      success: true,
      message: `Email ${params.emailId} marked as processed`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `Error marking email as processed: ${errorMessage}`,
    };
  }
}
