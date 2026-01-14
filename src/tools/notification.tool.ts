import { z } from 'zod';
import { getEmailNotificationService } from '../services/email.service';
import { getDatabaseService } from '../services/database.service';
import { ExtractionResult } from '../services/textract.service';

/**
 * Send Notification Tool Definition for ADK Agent
 * Allows the agent to send email notifications about extracted documents
 */
export const sendNotificationToolDefinition = {
  name: 'sendExtractionNotification',
  description: `Send an email notification with the results of a document extraction.
    The notification includes a summary of extracted data, key-value pairs, and tables.
    Should be called after successfully saving extracted data to the database.`,
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
};

/**
 * Send notification tool implementation
 */
export async function sendExtractionNotificationTool(params: {
  documentId: string;
  emailId: string;
  emailSubject: string;
  emailFrom: string;
  fileName: string;
  rawText: string;
  keyValuePairs: Array<{ key: string; value: string; confidence: number }>;
  tables: Array<{ rows: string[][]; confidence: number }>;
  averageConfidence: number;
}): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const emailService = getEmailNotificationService();
    const dbService = getDatabaseService();

    const extractionResult: ExtractionResult = {
      rawText: params.rawText,
      keyValuePairs: params.keyValuePairs,
      tables: params.tables,
      averageConfidence: params.averageConfidence,
    };

    await emailService.sendExtractionNotification({
      emailId: params.emailId,
      emailSubject: params.emailSubject,
      emailFrom: params.emailFrom,
      fileName: params.fileName,
      extractionResult,
    });

    // Mark document as notified
    await dbService.markAsNotified(params.documentId);

    return {
      success: true,
      message: `Notification sent successfully for document: ${params.fileName}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `Error sending notification: ${errorMessage}`,
    };
  }
}

/**
 * Send Summary Notification Tool Definition
 * For sending a batch summary of multiple processed documents
 */
export const sendSummaryNotificationToolDefinition = {
  name: 'sendBatchSummary',
  description: `Send a summary notification for a batch of processed documents.
    Useful after processing multiple emails to provide an overview of all extractions.`,
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
};

/**
 * Send batch summary implementation
 */
export async function sendBatchSummaryTool(params: {
  processedCount: number;
  successCount: number;
  errorCount: number;
  documentSummaries: Array<{
    fileName: string;
    emailSubject: string;
    keyValueCount: number;
    tableCount: number;
    confidence: number;
  }>;
}): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const emailService = getEmailNotificationService();
    
    // Create a summary extraction result for batch notification
    const summaryText = params.documentSummaries
      .map(doc => `- ${doc.fileName} (${doc.emailSubject}): ${doc.keyValueCount} campos, ${doc.tableCount} tablas, ${doc.confidence.toFixed(1)}% confianza`)
      .join('\n');

    const extractionResult: ExtractionResult = {
      rawText: `Resumen de Procesamiento por Lotes\n\nDocumentos procesados: ${params.processedCount}\nExitosos: ${params.successCount}\nErrores: ${params.errorCount}\n\nDetalle:\n${summaryText}`,
      keyValuePairs: [
        { key: 'Total Procesados', value: params.processedCount.toString(), confidence: 100 },
        { key: 'Exitosos', value: params.successCount.toString(), confidence: 100 },
        { key: 'Errores', value: params.errorCount.toString(), confidence: 100 },
      ],
      tables: [
        {
          rows: [
            ['Archivo', 'Asunto', 'Campos', 'Tablas', 'Confianza'],
            ...params.documentSummaries.map(doc => [
              doc.fileName,
              doc.emailSubject,
              doc.keyValueCount.toString(),
              doc.tableCount.toString(),
              `${doc.confidence.toFixed(1)}%`,
            ]),
          ],
          confidence: 100,
        },
      ],
      averageConfidence: params.documentSummaries.length > 0
        ? params.documentSummaries.reduce((sum, doc) => sum + doc.confidence, 0) / params.documentSummaries.length
        : 0,
    };

    await emailService.sendExtractionNotification({
      emailId: 'batch-summary',
      emailSubject: `Resumen de Lote: ${params.processedCount} documentos`,
      emailFrom: 'Sistema',
      fileName: 'Resumen de Procesamiento',
      extractionResult,
    });

    return {
      success: true,
      message: `Batch summary notification sent for ${params.processedCount} documents`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `Error sending batch summary: ${errorMessage}`,
    };
  }
}
