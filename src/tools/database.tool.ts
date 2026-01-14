import { z } from 'zod';
import { getDatabaseService } from '../services/database.service';
import { ExtractionResult } from '../services/textract.service';

/**
 * Save Document Tool Definition for ADK Agent
 * Allows the agent to persist extracted document data to PostgreSQL
 */
export const saveDocumentToolDefinition = {
  name: 'saveExtractedData',
  description: `Save extracted document data to the PostgreSQL database.
    This should be called after successfully extracting data from a document.
    Stores the raw text, key-value pairs, tables, and metadata about the source email.`,
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
};

/**
 * Save document tool implementation
 */
export async function saveExtractedDataTool(params: {
  emailId: string;
  emailSubject?: string;
  emailFrom?: string;
  emailDate?: string;
  fileName: string;
  fileType?: string;
  rawText: string;
  keyValuePairs: Array<{ key: string; value: string; confidence: number }>;
  tables: Array<{ rows: string[][]; confidence: number }>;
  averageConfidence: number;
}): Promise<{
  success: boolean;
  documentId?: string;
  message: string;
}> {
  try {
    const dbService = getDatabaseService();

    const extractionResult: ExtractionResult = {
      rawText: params.rawText,
      keyValuePairs: params.keyValuePairs,
      tables: params.tables,
      averageConfidence: params.averageConfidence,
    };

    const document = await dbService.saveExtractedDocument({
      emailId: params.emailId,
      emailSubject: params.emailSubject,
      emailFrom: params.emailFrom,
      emailDate: params.emailDate ? new Date(params.emailDate) : undefined,
      fileName: params.fileName,
      fileType: params.fileType,
      extractionResult,
    });

    return {
      success: true,
      documentId: document.id,
      message: `Document saved successfully with ID: ${document.id}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `Error saving document: ${errorMessage}`,
    };
  }
}

/**
 * Get Statistics Tool Definition
 */
export const getStatsToolDefinition = {
  name: 'getExtractionStats',
  description: `Get statistics about document extractions.
    Returns total documents processed, success/error counts, and average confidence.
    Useful for monitoring and reporting on extraction performance.`,
  parameters: z.object({}),
};

/**
 * Get stats tool implementation
 */
export async function getExtractionStatsTool(): Promise<{
  success: boolean;
  stats?: {
    total: number;
    completed: number;
    errors: number;
    avgConfidence: number;
  };
  message: string;
}> {
  try {
    const dbService = getDatabaseService();
    const stats = await dbService.getStats();

    return {
      success: true,
      stats,
      message: `Statistics retrieved: ${stats.total} documents processed`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `Error getting statistics: ${errorMessage}`,
    };
  }
}

/**
 * Get Recent Documents Tool Definition
 */
export const getRecentDocumentsToolDefinition = {
  name: 'getRecentDocuments',
  description: `Get recently extracted documents from the database.
    Returns document metadata and extraction summaries.
    Useful for reviewing recent processing activity.`,
  parameters: z.object({
    limit: z.number().optional().default(10).describe('Maximum number of documents to return'),
    status: z.string().optional().describe('Filter by status (completed, error, pending)'),
  }),
};

/**
 * Get recent documents implementation
 */
export async function getRecentDocumentsTool(params: {
  limit?: number;
  status?: string;
}): Promise<{
  success: boolean;
  documents: Array<{
    id: string;
    emailSubject: string | null;
    fileName: string;
    extractedAt: string;
    status: string;
    confidence: number | null;
    keyValueCount: number;
    tableCount: number;
  }>;
  message: string;
}> {
  try {
    const dbService = getDatabaseService();
    const documents = await dbService.getExtractedDocuments({
      limit: params.limit || 10,
      status: params.status,
    });

    return {
      success: true,
      documents: documents.map(doc => ({
        id: doc.id,
        emailSubject: doc.emailSubject,
        fileName: doc.fileName,
        extractedAt: doc.extractedAt.toISOString(),
        status: doc.status,
        confidence: doc.confidence,
        keyValueCount: Array.isArray(doc.structuredData) ? doc.structuredData.length : 0,
        tableCount: Array.isArray(doc.tablesData) ? doc.tablesData.length : 0,
      })),
      message: `Retrieved ${documents.length} documents`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      documents: [],
      message: `Error getting documents: ${errorMessage}`,
    };
  }
}
