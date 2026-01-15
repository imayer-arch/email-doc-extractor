import { 
  LlmAgent, 
  FunctionTool, 
  Runner, 
  InMemorySessionService,
  InMemoryArtifactService,
} from '@google/adk';
import { config } from '../config';
import { AGENT_SYSTEM_PROMPT } from './prompts';

// Import tool implementations
import {
  checkEmailsTool,
  getEmailAttachmentTool,
  markEmailProcessedTool,
} from '../tools/gmail.tool';
import {
  extractDocumentDataTool,
  analyzeExtractionTool,
} from '../tools/textract.tool';
import {
  saveExtractedDataTool,
  getExtractionStatsTool,
  getRecentDocumentsTool,
} from '../tools/database.tool';
import {
  sendExtractionNotificationTool,
  sendBatchSummaryTool,
} from '../tools/notification.tool';
import { z } from 'zod';

/**
 * Create the Document Extraction Agent with all tools
 */
export function createDocumentExtractionAgent(): LlmAgent {
  // Define tools using FunctionTool
  const checkEmailsToolDef = new FunctionTool({
    name: 'checkEmails',
    description: `Check Gmail inbox for unread emails with attachments. 
      Returns a list of emails that have not been processed yet, including their 
      subject, sender, date, and attachment information.`,
    parameters: z.object({
      maxResults: z.number().optional().describe('Maximum number of emails to return'),
    }),
    execute: async (params) => checkEmailsTool({ maxResults: params.maxResults }),
  });

  const getAttachmentToolDef = new FunctionTool({
    name: 'getEmailAttachment',
    description: `Get the binary data of a specific attachment from an email. 
      Returns the attachment data as base64 encoded string.`,
    parameters: z.object({
      emailId: z.string().describe('The ID of the email containing the attachment'),
      attachmentFilename: z.string().describe('The filename of the attachment to retrieve'),
    }),
    execute: async (params) => getEmailAttachmentTool(params),
  });

  const markEmailProcessedToolDef = new FunctionTool({
    name: 'markEmailProcessed',
    description: `Mark an email as processed after all its attachments have been extracted.`,
    parameters: z.object({
      emailId: z.string().describe('The ID of the email to mark as processed'),
      markAsRead: z.boolean().optional().describe('Whether to also mark the email as read in Gmail'),
    }),
    execute: async (params) => markEmailProcessedTool(params),
  });

  const extractDocumentToolDef = new FunctionTool({
    name: 'extractDocumentData',
    description: `Extract text, key-value pairs, and tables from a document using AWS Textract.
      Supports PDF, PNG, JPEG, and TIFF files. The document should be provided as base64 encoded data.`,
    parameters: z.object({
      documentBase64: z.string().describe('The document data as a base64 encoded string'),
      filename: z.string().describe('The filename of the document'),
    }),
    execute: async (params) => extractDocumentDataTool(params),
  });

  const analyzeExtractionToolDef = new FunctionTool({
    name: 'analyzeExtraction',
    description: `Analyze and summarize extraction results from a document.
      Helps identify important data like monetary amounts, dates, and identifiers.`,
    parameters: z.object({
      rawText: z.string().describe('The raw text extracted from the document'),
      keyValuePairs: z.array(z.object({
        key: z.string(),
        value: z.string(),
        confidence: z.number(),
      })).describe('Key-value pairs extracted from the document'),
    }),
    execute: async (params) => analyzeExtractionTool(params),
  });

  const saveDocumentToolDef = new FunctionTool({
    name: 'saveExtractedData',
    description: `Save extracted document data to the PostgreSQL database.`,
    parameters: z.object({
      emailId: z.string().describe('The ID of the source email'),
      emailSubject: z.string().optional().describe('The subject of the source email'),
      emailFrom: z.string().optional().describe('The sender of the source email'),
      emailDate: z.string().optional().describe('The date of the source email (ISO format)'),
      fileName: z.string().describe('The name of the processed file'),
      fileType: z.string().optional().describe('The MIME type of the file'),
      rawText: z.string().describe('The raw text extracted from the document'),
      keyValuePairs: z.array(z.object({
        key: z.string(),
        value: z.string(),
        confidence: z.number(),
      })).describe('Key-value pairs extracted from the document'),
      tables: z.array(z.object({
        rows: z.array(z.array(z.string())),
        confidence: z.number(),
      })).describe('Tables extracted from the document'),
      averageConfidence: z.number().describe('Average confidence score of the extraction'),
    }),
    execute: async (params) => saveExtractedDataTool(params),
  });

  const getStatsToolDef = new FunctionTool({
    name: 'getExtractionStats',
    description: `Get statistics about document extractions.`,
    parameters: z.object({}),
    execute: async () => getExtractionStatsTool(),
  });

  const getRecentDocsToolDef = new FunctionTool({
    name: 'getRecentDocuments',
    description: `Get recently extracted documents from the database.`,
    parameters: z.object({
      limit: z.number().optional().describe('Maximum number of documents to return'),
      status: z.string().optional().describe('Filter by status'),
    }),
    execute: async (params) => getRecentDocumentsTool(params),
  });

  const sendNotificationToolDef = new FunctionTool({
    name: 'sendExtractionNotification',
    description: `Send an email notification with the results of a document extraction.`,
    parameters: z.object({
      documentId: z.string().describe('The ID of the saved document in the database'),
      emailId: z.string().describe('The ID of the source email'),
      emailSubject: z.string().describe('The subject of the source email'),
      emailFrom: z.string().describe('The sender of the source email'),
      fileName: z.string().describe('The name of the processed file'),
      rawText: z.string().describe('The raw text extracted from the document'),
      keyValuePairs: z.array(z.object({
        key: z.string(),
        value: z.string(),
        confidence: z.number(),
      })).describe('Key-value pairs extracted from the document'),
      tables: z.array(z.object({
        rows: z.array(z.array(z.string())),
        confidence: z.number(),
      })).describe('Tables extracted from the document'),
      averageConfidence: z.number().describe('Average confidence score of the extraction'),
    }),
    execute: async (params) => sendExtractionNotificationTool(params),
  });

  const sendBatchSummaryToolDef = new FunctionTool({
    name: 'sendBatchSummary',
    description: `Send a summary notification for a batch of processed documents.`,
    parameters: z.object({
      processedCount: z.number().describe('Number of documents processed'),
      successCount: z.number().describe('Number of successful extractions'),
      errorCount: z.number().describe('Number of failed extractions'),
      documentSummaries: z.array(z.object({
        fileName: z.string(),
        emailSubject: z.string(),
        keyValueCount: z.number(),
        tableCount: z.number(),
        confidence: z.number(),
      })).describe('Summary of each processed document'),
    }),
    execute: async (params) => sendBatchSummaryTool(params),
  });

  // Create the agent
  const agent = new LlmAgent({
    name: 'document_extraction_agent',
    model: 'gemini-2.0-flash',
    instruction: AGENT_SYSTEM_PROMPT,
    tools: [
      checkEmailsToolDef,
      getAttachmentToolDef,
      markEmailProcessedToolDef,
      extractDocumentToolDef,
      analyzeExtractionToolDef,
      saveDocumentToolDef,
      getStatsToolDef,
      getRecentDocsToolDef,
      sendNotificationToolDef,
      sendBatchSummaryToolDef,
    ],
  });

  return agent;
}

/**
 * Create a runner for the agent
 */
export function createRunner(): Runner {
  const agent = createDocumentExtractionAgent();
  
  const sessionService = new InMemorySessionService();
  const artifactService = new InMemoryArtifactService();

  const runner = new Runner({
    appName: 'email_doc_extractor',
    agent,
    sessionService,
    artifactService,
  });

  return runner;
}

/**
 * Run the agent with a specific task
 */
export async function runAgent(task: string): Promise<string> {
  const runner = createRunner();
  const userId = 'default-user';
  const sessionId = `session-${Date.now()}`;
  
  try {
    // Create a session first
    const session = await runner.sessionService.createSession({
      appName: 'email_doc_extractor',
      userId,
      sessionId,
    });

    // Run the agent
    const events = runner.runAsync({
      userId,
      sessionId: session.id,
      newMessage: {
        role: 'user',
        parts: [{ text: task }],
      },
    });

    // Collect all responses and log tool calls
    let finalResponse = '';
    for await (const event of events) {
      // Log all events for debugging
      console.log(`[Agent Event] Author: ${event.author}, Type: ${event.content?.role || 'unknown'}`);
      
      if (event.content?.parts) {
        for (const part of event.content.parts) {
          if ('text' in part && part.text) {
            finalResponse += part.text;
          }
          // Log function calls
          if ('functionCall' in part) {
            console.log(`[Tool Call] ${(part as any).functionCall.name}(${JSON.stringify((part as any).functionCall.args).substring(0, 100)}...)`);
          }
          // Log function responses
          if ('functionResponse' in part) {
            console.log(`[Tool Response] ${(part as any).functionResponse.name} completed`);
          }
        }
      }
    }

    return finalResponse || 'Processing completed.';
  } catch (error) {
    console.error('Agent execution error:', error);
    throw error;
  }
}

/**
 * Process emails automatically
 * This is the main entry point for automated processing
 */
export async function processEmailsAutomatically(): Promise<void> {
  console.log('Starting automatic email processing...');
  
  const task = `
    Please check for new emails with attachments and process them.
    For each document:
    1. Extract all data using Textract
    2. Save the results to the database
    3. Send a notification email with the findings
    
    After processing all emails, provide a summary of what was done.
  `;

  try {
    const result = await runAgent(task);
    console.log('Processing complete:', result);
  } catch (error) {
    console.error('Error during automatic processing:', error);
  }
}
