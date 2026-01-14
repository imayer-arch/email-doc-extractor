import { z } from 'zod';
import { getTextractService, ExtractionResult } from '../services/textract.service';

/**
 * Textract Tool Definition for ADK Agent
 * Allows the agent to extract data from documents using AWS Textract
 */
export const extractDocumentToolDefinition = {
  name: 'extractDocumentData',
  description: `Extract text, key-value pairs, and tables from a document using AWS Textract.
    Supports PDF, PNG, JPEG, and TIFF files.
    The document should be provided as base64 encoded data.
    Returns structured data including:
    - Raw text content
    - Key-value pairs (form fields)
    - Tables with their data
    - Confidence scores for extracted data`,
  parameters: z.object({
    documentBase64: z.string().describe('The document data as a base64 encoded string'),
    filename: z.string().describe('The filename of the document (for logging purposes)'),
  }),
};

/**
 * Extract document tool implementation
 */
export async function extractDocumentDataTool(params: {
  documentBase64: string;
  filename: string;
}): Promise<{
  success: boolean;
  result?: ExtractionResult;
  summary?: {
    textLength: number;
    keyValueCount: number;
    tableCount: number;
    averageConfidence: number;
  };
  message: string;
}> {
  try {
    console.log(`Extracting data from document: ${params.filename}`);
    
    const textractService = getTextractService();
    
    // Convert base64 to buffer
    const documentBuffer = Buffer.from(params.documentBase64, 'base64');
    
    // Validate file size (Textract has a 10MB limit for synchronous operations)
    const maxSizeBytes = 10 * 1024 * 1024; // 10MB
    if (documentBuffer.length > maxSizeBytes) {
      return {
        success: false,
        message: `Document too large. Maximum size is 10MB, got ${(documentBuffer.length / 1024 / 1024).toFixed(2)}MB`,
      };
    }

    // Extract data using Textract
    const result = await textractService.analyzeDocument(documentBuffer);

    console.log(`Extraction complete for ${params.filename}:`);
    console.log(`  - Text lines: ${result.rawText.split('\n').length}`);
    console.log(`  - Key-value pairs: ${result.keyValuePairs.length}`);
    console.log(`  - Tables: ${result.tables.length}`);
    console.log(`  - Average confidence: ${result.averageConfidence.toFixed(1)}%`);

    return {
      success: true,
      result,
      summary: {
        textLength: result.rawText.length,
        keyValueCount: result.keyValuePairs.length,
        tableCount: result.tables.length,
        averageConfidence: result.averageConfidence,
      },
      message: `Successfully extracted data from ${params.filename}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error extracting document ${params.filename}:`, errorMessage);
    
    return {
      success: false,
      message: `Error extracting document: ${errorMessage}`,
    };
  }
}

/**
 * Analyze extraction results tool definition
 * Helps the agent understand and summarize the extracted data
 */
export const analyzeExtractionToolDefinition = {
  name: 'analyzeExtraction',
  description: `Analyze and summarize extraction results from a document.
    Helps identify important data like monetary amounts, dates, and identifiers.
    Use this after extractDocumentData to get insights about the extracted content.`,
  parameters: z.object({
    rawText: z.string().describe('The raw text extracted from the document'),
    keyValuePairs: z.array(z.object({
      key: z.string(),
      value: z.string(),
      confidence: z.number(),
    })).describe('Key-value pairs extracted from the document'),
  }),
};

/**
 * Analyze extraction implementation
 */
export async function analyzeExtractionTool(params: {
  rawText: string;
  keyValuePairs: Array<{ key: string; value: string; confidence: number }>;
}): Promise<{
  success: boolean;
  analysis: {
    monetaryValues: Array<{ context: string; value: string }>;
    dates: string[];
    emails: string[];
    phoneNumbers: string[];
    identifiers: Array<{ type: string; value: string }>;
    highConfidenceFields: Array<{ key: string; value: string }>;
    lowConfidenceFields: Array<{ key: string; value: string; confidence: number }>;
  };
  message: string;
}> {
  try {
    const { rawText, keyValuePairs } = params;

    // Extract monetary values
    const monetaryRegex = /(?:\$|USD|EUR|€|£)?[\s]?[\d,]+(?:\.\d{2})?(?:\s?(?:USD|EUR|dollars?|euros?|pesos?))?/gi;
    const monetaryMatches = rawText.match(monetaryRegex) || [];
    const monetaryValues = monetaryMatches
      .filter(m => /\d/.test(m))
      .map(value => ({
        context: 'Found in text',
        value: value.trim(),
      }));

    // Extract dates
    const dateRegex = /\b(?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/gi;
    const dates = (rawText.match(dateRegex) || []).map(d => d.trim());

    // Extract emails
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = rawText.match(emailRegex) || [];

    // Extract phone numbers
    const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
    const phoneNumbers = rawText.match(phoneRegex) || [];

    // Extract identifiers (account numbers, invoice numbers, etc.)
    const identifierPatterns = [
      { type: 'Account Number', regex: /(?:account|acct|cuenta)[\s#:]*([A-Z0-9-]+)/gi },
      { type: 'Invoice Number', regex: /(?:invoice|factura|inv)[\s#:]*([A-Z0-9-]+)/gi },
      { type: 'Reference', regex: /(?:ref|reference|referencia)[\s#:]*([A-Z0-9-]+)/gi },
    ];

    const identifiers: Array<{ type: string; value: string }> = [];
    for (const pattern of identifierPatterns) {
      let match;
      while ((match = pattern.regex.exec(rawText)) !== null) {
        identifiers.push({ type: pattern.type, value: match[1] });
      }
    }

    // Categorize fields by confidence
    const highConfidenceThreshold = 90;
    const lowConfidenceThreshold = 70;

    const highConfidenceFields = keyValuePairs
      .filter(kv => kv.confidence >= highConfidenceThreshold)
      .map(kv => ({ key: kv.key, value: kv.value }));

    const lowConfidenceFields = keyValuePairs
      .filter(kv => kv.confidence < lowConfidenceThreshold)
      .map(kv => ({ key: kv.key, value: kv.value, confidence: kv.confidence }));

    return {
      success: true,
      analysis: {
        monetaryValues,
        dates: [...new Set(dates)],
        emails: [...new Set(emails)],
        phoneNumbers: [...new Set(phoneNumbers)],
        identifiers,
        highConfidenceFields,
        lowConfidenceFields,
      },
      message: 'Analysis complete',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      analysis: {
        monetaryValues: [],
        dates: [],
        emails: [],
        phoneNumbers: [],
        identifiers: [],
        highConfidenceFields: [],
        lowConfidenceFields: [],
      },
      message: `Error analyzing extraction: ${errorMessage}`,
    };
  }
}
