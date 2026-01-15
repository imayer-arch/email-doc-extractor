/**
 * Email Processor Service - Handles email processing
 * Uses in-memory lock to prevent parallel processing of same email
 */

import { PrismaClient } from '@prisma/client';
import { GmailService } from './gmail.service';
import { getTextractService } from './textract.service';
import { getDatabaseService } from './database.service';
import { GmailNotification } from './gmail-watch.service';

const prisma = new PrismaClient();

// In-memory lock to prevent parallel processing of the same email
const processingEmails = new Set<string>();

function acquireLock(emailId: string): boolean {
  if (processingEmails.has(emailId)) {
    return false; // Already being processed
  }
  processingEmails.add(emailId);
  return true;
}

function releaseLock(emailId: string): void {
  processingEmails.delete(emailId);
}

export interface ProcessingResult {
  userId: string;
  email: string;
  messagesProcessed: number;
  documentsExtracted: number;
  errors: string[];
}

export class EmailProcessorService {
  /**
   * Process new emails based on Pub/Sub notification
   * Simplified approach: check for unread emails and skip already processed ones
   */
  async processNewEmails(notification: GmailNotification): Promise<ProcessingResult> {
    const { emailAddress, historyId } = notification;
    
    console.log(`\n========================================`);
    console.log(`[EmailProcessor] Processing notification`);
    console.log(`  Email: ${emailAddress}`);
    console.log(`  HistoryId: ${historyId}`);
    console.log(`========================================`);

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: emailAddress },
      select: {
        id: true,
        email: true,
        gmailConnected: true,
        gmailRefreshToken: true,
        gmailHistoryId: true,
      },
    });

    if (!user) {
      console.log(`[EmailProcessor] User not found: ${emailAddress}`);
      return {
        userId: '',
        email: emailAddress,
        messagesProcessed: 0,
        documentsExtracted: 0,
        errors: [`User not found: ${emailAddress}`],
      };
    }

    if (!user.gmailConnected || !user.gmailRefreshToken) {
      console.log(`[EmailProcessor] Gmail not connected for: ${emailAddress}`);
      return {
        userId: user.id,
        email: emailAddress,
        messagesProcessed: 0,
        documentsExtracted: 0,
        errors: ['Gmail not connected'],
      };
    }

    const result: ProcessingResult = {
      userId: user.id,
      email: emailAddress,
      messagesProcessed: 0,
      documentsExtracted: 0,
      errors: [],
    };

    try {
      // Use simplified approach: get unread emails and filter out already processed
      const gmailService = await GmailService.forUser(user.id);
      const textractService = getTextractService();
      const dbService = getDatabaseService();

      // Get unread emails with attachments
      console.log(`  Fetching unread emails with attachments...`);
      const emails = await gmailService.getUnreadEmailsWithAttachments();
      console.log(`  Found ${emails.length} unread emails with attachments`);

      if (emails.length === 0) {
        console.log(`  No unread emails to process`);
        // Update historyId anyway
        await prisma.user.update({
          where: { id: user.id },
          data: { gmailHistoryId: String(historyId) },
        });
        return result;
      }

      // Filter out already processed emails
      const processedEmailIds = await prisma.processedEmail.findMany({
        where: { userId: user.id },
        select: { emailId: true },
      });
      const processedSet = new Set(processedEmailIds.map(p => p.emailId));
      
      const newEmails = emails.filter(e => !processedSet.has(e.id));
      console.log(`  New emails to process: ${newEmails.length} (${emails.length - newEmails.length} already processed)`);

      if (newEmails.length === 0) {
        console.log(`  All emails already processed`);
        await prisma.user.update({
          where: { id: user.id },
          data: { gmailHistoryId: String(historyId) },
        });
        return result;
      }

      // Process each new email
      for (const email of newEmails) {
        const messageId = email.id;
        
        // Try to acquire lock - if already processing, skip
        if (!acquireLock(messageId)) {
          console.log(`  [${messageId}] SKIPPED - already being processed by another request`);
          continue;
        }
        
        try {
          // Double-check in DB (in case it was just processed)
          const alreadyProcessed = await prisma.processedEmail.findUnique({
            where: { emailId: messageId },
          });
          
          if (alreadyProcessed) {
            console.log(`  [${messageId}] SKIPPED - already in ProcessedEmail table`);
            releaseLock(messageId);
            continue;
          }
          
          console.log(`  [${messageId}] Processing: ${email.subject} (${email.attachments.length} attachments)`);

          // Mark as processed IMMEDIATELY
          await prisma.processedEmail.create({
            data: { emailId: messageId, userId: user.id },
          });
          
          result.messagesProcessed++;

          // Process each attachment
          for (const attachment of email.attachments) {
            try {
              console.log(`    Processing: ${attachment.filename}`);

              // Extract with Textract
              const extractionResult = await textractService.analyzeDocumentAsync(
                attachment.data,
                attachment.filename,
                attachment.mimeType
              );

              // Save to database
              await dbService.saveExtractedDocument({
                emailId: messageId,
                emailSubject: email.subject,
                emailFrom: email.from,
                emailDate: email.date,
                fileName: attachment.filename,
                fileType: attachment.mimeType,
                extractionResult,
                userId: user.id,
              });

              result.documentsExtracted++;
              console.log(`    Done: ${attachment.filename}`);
            } catch (attachmentError) {
              const errorMsg = `Error processing ${attachment.filename}: ${attachmentError instanceof Error ? attachmentError.message : 'Unknown error'}`;
              console.error(`    ${errorMsg}`);
              result.errors.push(errorMsg);
            }
          }

          // Mark email as read in Gmail
          const markedAsRead = await gmailService.markAsRead(messageId);
          if (!markedAsRead) {
            console.error(`  [${messageId}] WARNING: Could not mark as read - may cause reprocessing!`);
            console.error(`  [${messageId}] User may need to reconnect Gmail to grant modify permission`);
          }
          
          console.log(`  [${messageId}] DONE`);

        } catch (msgError) {
          const errorMsg = `Error processing message ${messageId}: ${msgError instanceof Error ? msgError.message : 'Unknown error'}`;
          console.error(`  ${errorMsg}`);
          result.errors.push(errorMsg);
        } finally {
          // Always release the lock
          releaseLock(messageId);
        }
      }

      // ALWAYS update historyId to prevent reprocessing
      console.log(`  Updating historyId to: ${historyId}`);
      await prisma.user.update({
        where: { id: user.id },
        data: { gmailHistoryId: String(historyId) },
      });

      console.log(`[EmailProcessor] Completed for ${emailAddress}`);
      console.log(`  Messages: ${result.messagesProcessed}, Documents: ${result.documentsExtracted}, Errors: ${result.errors.length}`);

    } catch (error) {
      const errorMsg = `Processing error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`[EmailProcessor] ${errorMsg}`);
      result.errors.push(errorMsg);
      
      // Still try to update historyId even on error to prevent infinite reprocessing
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: { gmailHistoryId: String(historyId) },
        });
        console.log(`  Updated historyId despite error`);
      } catch (updateError) {
        console.error(`  Failed to update historyId:`, updateError);
      }
    }

    return result;
  }

  /**
   * Fallback: Process all unread emails for a user
   * Used when no historyId is available
   */
  async processUnreadEmails(userId: string): Promise<ProcessingResult> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    const result: ProcessingResult = {
      userId,
      email: user?.email || '',
      messagesProcessed: 0,
      documentsExtracted: 0,
      errors: [],
    };

    try {
      const gmailService = await GmailService.forUser(userId);
      const textractService = getTextractService();
      const dbService = getDatabaseService();

      // Get unread emails with attachments
      const emails = await gmailService.getUnreadEmailsWithAttachments();
      console.log(`[EmailProcessor] Found ${emails.length} unread emails with attachments`);

      for (const email of emails) {
        // Check if already processed
        const existingDoc = await prisma.extractedDocument.findFirst({
          where: { emailId: email.id, userId },
        });

        if (existingDoc) {
          continue;
        }

        result.messagesProcessed++;

        for (const attachment of email.attachments) {
          try {
            const extractionResult = await textractService.analyzeDocumentAsync(
              attachment.data,
              attachment.filename,
              attachment.mimeType
            );

            await dbService.saveExtractedDocument({
              emailId: email.id,
              emailSubject: email.subject,
              emailFrom: email.from,
              emailDate: email.date,
              fileName: attachment.filename,
              fileType: attachment.mimeType,
              extractionResult,
              userId,
            });

            result.documentsExtracted++;
          } catch (error) {
            result.errors.push(`${attachment.filename}: ${error instanceof Error ? error.message : 'Unknown'}`);
          }
        }

        await dbService.markEmailProcessed(email.id, userId);
        const marked = await gmailService.markAsRead(email.id);
        if (!marked) {
          console.warn(`  Could not mark ${email.id} as read`);
        }
      }

    } catch (error) {
      result.errors.push(`Processing error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }

    return result;
  }

  /**
   * Process a specific email by ID
   */
  async processEmailById(userId: string, emailId: string): Promise<ProcessingResult> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    const result: ProcessingResult = {
      userId,
      email: user?.email || '',
      messagesProcessed: 0,
      documentsExtracted: 0,
      errors: [],
    };

    try {
      const gmailService = await GmailService.forUser(userId);
      const textractService = getTextractService();
      const dbService = getDatabaseService();

      const emailDetails = await gmailService.getEmailDetails(emailId);
      
      if (!emailDetails) {
        result.errors.push('Email not found');
        return result;
      }

      if (emailDetails.attachments.length === 0) {
        result.errors.push('No attachments found');
        return result;
      }

      result.messagesProcessed = 1;

      for (const attachment of emailDetails.attachments) {
        try {
          const extractionResult = await textractService.analyzeDocumentAsync(
            attachment.data,
            attachment.filename,
            attachment.mimeType
          );

          await dbService.saveExtractedDocument({
            emailId,
            emailSubject: emailDetails.subject,
            emailFrom: emailDetails.from,
            emailDate: emailDetails.date,
            fileName: attachment.filename,
            fileType: attachment.mimeType,
            extractionResult,
            userId,
          });

          result.documentsExtracted++;
        } catch (error) {
          result.errors.push(`${attachment.filename}: ${error instanceof Error ? error.message : 'Unknown'}`);
        }
      }

      await dbService.markEmailProcessed(emailId, userId);
      const marked = await gmailService.markAsRead(emailId);
      if (!marked) {
        console.warn(`  Could not mark ${emailId} as read`);
      }

    } catch (error) {
      result.errors.push(`Processing error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }

    return result;
  }
}

// Singleton instance
let emailProcessorInstance: EmailProcessorService | null = null;

export function getEmailProcessorService(): EmailProcessorService {
  if (!emailProcessorInstance) {
    emailProcessorInstance = new EmailProcessorService();
  }
  return emailProcessorInstance;
}
