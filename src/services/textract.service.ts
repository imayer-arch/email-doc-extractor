import {
  TextractClient,
  AnalyzeDocumentCommand,
  DetectDocumentTextCommand,
  StartDocumentAnalysisCommand,
  GetDocumentAnalysisCommand,
  FeatureType,
  Block,
  BlockType,
  Relationship,
} from '@aws-sdk/client-textract';
import { config } from '../config';
import { getS3Service } from './s3.service';

export interface ExtractedKeyValue {
  key: string;
  value: string;
  confidence: number;
}

export interface ExtractedTable {
  rows: string[][];
  confidence: number;
}

export interface ExtractionResult {
  rawText: string;
  keyValuePairs: ExtractedKeyValue[];
  tables: ExtractedTable[];
  averageConfidence: number;
}

export class TextractService {
  private client: TextractClient;

  constructor() {
    this.client = new TextractClient({
      region: config.aws.region,
      credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
      },
    });
  }

  /**
   * Analyze a document and extract text, key-value pairs, and tables
   * Falls back to simple text detection if full analysis fails
   */
  async analyzeDocument(documentBytes: Buffer): Promise<ExtractionResult> {
    try {
      // Try full analysis first (forms + tables)
      const command = new AnalyzeDocumentCommand({
        Document: {
          Bytes: documentBytes,
        },
        FeatureTypes: [FeatureType.TABLES, FeatureType.FORMS],
      });

      const response = await this.client.send(command);
      const blocks = response.Blocks || [];

      // Extract different types of content
      const rawText = this.extractRawText(blocks);
      const keyValuePairs = this.extractKeyValuePairs(blocks);
      const tables = this.extractTables(blocks);

      // Calculate average confidence
      const allConfidences = [
        ...keyValuePairs.map(kv => kv.confidence),
        ...tables.map(t => t.confidence),
      ];
      const averageConfidence = allConfidences.length > 0
        ? allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length
        : 0;

      return {
        rawText,
        keyValuePairs,
        tables,
        averageConfidence,
      };
    } catch (error: any) {
      // If AnalyzeDocument fails, try simple text detection
      if (error.name === 'UnsupportedDocumentException' || error.__type === 'UnsupportedDocumentException') {
        console.log('AnalyzeDocument failed, falling back to DetectDocumentText...');
        return this.detectTextOnly(documentBytes);
      }
      console.error('Error analyzing document with Textract:', error);
      throw error;
    }
  }

  /**
   * Simple text detection fallback (works with more document formats)
   */
  async detectTextOnly(documentBytes: Buffer): Promise<ExtractionResult> {
    try {
      const command = new DetectDocumentTextCommand({
        Document: {
          Bytes: documentBytes,
        },
      });

      const response = await this.client.send(command);
      const blocks = response.Blocks || [];

      const rawText = this.extractRawText(blocks);
      
      // Calculate average confidence from LINE blocks
      const lineBlocks = blocks.filter(b => b.BlockType === BlockType.LINE);
      const avgConfidence = lineBlocks.length > 0
        ? lineBlocks.reduce((sum, b) => sum + (b.Confidence || 0), 0) / lineBlocks.length
        : 0;

      return {
        rawText,
        keyValuePairs: [], // Not available in simple text detection
        tables: [], // Not available in simple text detection
        averageConfidence: avgConfidence,
      };
    } catch (error) {
      console.error('Error detecting text with Textract:', error);
      throw error;
    }
  }

  /**
   * Analyze document using async API (for multi-page documents)
   * Requires S3 bucket to be configured
   */
  async analyzeDocumentAsync(
    documentBytes: Buffer, 
    filename: string,
    mimeType: string
  ): Promise<ExtractionResult> {
    const s3Service = getS3Service();
    
    // 1. Upload to S3
    console.log('Uploading document to S3...');
    const { bucket, key } = await s3Service.uploadDocument(documentBytes, filename, mimeType);
    
    try {
      // 2. Start async analysis
      console.log('Starting Textract analysis...');
      const startCommand = new StartDocumentAnalysisCommand({
        DocumentLocation: {
          S3Object: {
            Bucket: bucket,
            Name: key,
          },
        },
        FeatureTypes: [FeatureType.TABLES, FeatureType.FORMS],
      });

      const startResponse = await this.client.send(startCommand);
      const jobId = startResponse.JobId;

      if (!jobId) {
        throw new Error('Failed to start Textract job - no JobId returned');
      }

      console.log(`Textract job started: ${jobId}`);

      // 3. Wait for completion (polling)
      const blocks = await this.waitForJobCompletion(jobId);

      // 4. Extract data from blocks
      const rawText = this.extractRawText(blocks);
      const keyValuePairs = this.extractKeyValuePairs(blocks);
      const tables = this.extractTables(blocks);

      const allConfidences = [
        ...keyValuePairs.map(kv => kv.confidence),
        ...tables.map(t => t.confidence),
      ];
      const averageConfidence = allConfidences.length > 0
        ? allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length
        : 0;

      return {
        rawText,
        keyValuePairs,
        tables,
        averageConfidence,
      };
    } finally {
      // 5. Cleanup - delete from S3
      console.log('Cleaning up S3...');
      await s3Service.deleteDocument(key);
    }
  }

  /**
   * Wait for async job to complete
   */
  private async waitForJobCompletion(jobId: string): Promise<Block[]> {
    const maxAttempts = 60; // 5 minutes max (5 sec intervals)
    let attempts = 0;
    let allBlocks: Block[] = [];

    while (attempts < maxAttempts) {
      const getCommand = new GetDocumentAnalysisCommand({
        JobId: jobId,
      });

      const response = await this.client.send(getCommand);
      const status = response.JobStatus;

      if (status === 'SUCCEEDED') {
        console.log('Textract job completed successfully!');
        allBlocks = response.Blocks || [];

        // Get remaining pages if any
        let nextToken = response.NextToken;
        while (nextToken) {
          const nextCommand = new GetDocumentAnalysisCommand({
            JobId: jobId,
            NextToken: nextToken,
          });
          const nextResponse = await this.client.send(nextCommand);
          allBlocks = allBlocks.concat(nextResponse.Blocks || []);
          nextToken = nextResponse.NextToken;
        }

        return allBlocks;
      } else if (status === 'FAILED') {
        throw new Error(`Textract job failed: ${response.StatusMessage}`);
      }

      // Still in progress, wait 5 seconds
      console.log(`Job status: ${status}... waiting`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;
    }

    throw new Error('Textract job timed out');
  }

  /**
   * Extract raw text from LINE blocks
   */
  private extractRawText(blocks: Block[]): string {
    const lines = blocks
      .filter(block => block.BlockType === BlockType.LINE)
      .map(block => block.Text || '')
      .filter(text => text.length > 0);

    return lines.join('\n');
  }

  /**
   * Extract key-value pairs from FORMS feature
   */
  private extractKeyValuePairs(blocks: Block[]): ExtractedKeyValue[] {
    const keyValuePairs: ExtractedKeyValue[] = [];
    const blockMap = new Map<string, Block>();

    // Create block map for quick lookup
    for (const block of blocks) {
      if (block.Id) {
        blockMap.set(block.Id, block);
      }
    }

    // Find KEY_VALUE_SET blocks
    const keyBlocks = blocks.filter(
      block => block.BlockType === BlockType.KEY_VALUE_SET && 
               block.EntityTypes?.includes('KEY')
    );

    for (const keyBlock of keyBlocks) {
      const keyText = this.getTextFromBlock(keyBlock, blockMap);
      const valueBlock = this.getValueBlock(keyBlock, blockMap);
      
      if (valueBlock) {
        const valueText = this.getTextFromBlock(valueBlock, blockMap);
        const confidence = ((keyBlock.Confidence || 0) + (valueBlock.Confidence || 0)) / 2;

        if (keyText || valueText) {
          keyValuePairs.push({
            key: keyText.trim(),
            value: valueText.trim(),
            confidence,
          });
        }
      }
    }

    return keyValuePairs;
  }

  /**
   * Extract tables from TABLE blocks
   */
  private extractTables(blocks: Block[]): ExtractedTable[] {
    const tables: ExtractedTable[] = [];
    const blockMap = new Map<string, Block>();

    // Create block map
    for (const block of blocks) {
      if (block.Id) {
        blockMap.set(block.Id, block);
      }
    }

    // Find TABLE blocks
    const tableBlocks = blocks.filter(block => block.BlockType === BlockType.TABLE);

    for (const tableBlock of tableBlocks) {
      const table = this.extractTableData(tableBlock, blockMap);
      if (table.rows.length > 0) {
        tables.push(table);
      }
    }

    return tables;
  }

  /**
   * Extract table data from a TABLE block
   */
  private extractTableData(tableBlock: Block, blockMap: Map<string, Block>): ExtractedTable {
    const rows: Map<number, Map<number, string>> = new Map();
    let totalConfidence = 0;
    let cellCount = 0;

    // Get child cell blocks
    const cellIds = this.getChildIds(tableBlock, 'CHILD');
    
    for (const cellId of cellIds) {
      const cellBlock = blockMap.get(cellId);
      if (cellBlock && cellBlock.BlockType === BlockType.CELL) {
        const rowIndex = cellBlock.RowIndex || 0;
        const colIndex = cellBlock.ColumnIndex || 0;
        const cellText = this.getTextFromBlock(cellBlock, blockMap);

        if (!rows.has(rowIndex)) {
          rows.set(rowIndex, new Map());
        }
        rows.get(rowIndex)!.set(colIndex, cellText);

        totalConfidence += cellBlock.Confidence || 0;
        cellCount++;
      }
    }

    // Convert to 2D array
    const sortedRowIndices = Array.from(rows.keys()).sort((a, b) => a - b);
    const tableRows: string[][] = [];

    for (const rowIndex of sortedRowIndices) {
      const row = rows.get(rowIndex)!;
      const sortedColIndices = Array.from(row.keys()).sort((a, b) => a - b);
      const rowData: string[] = [];

      for (const colIndex of sortedColIndices) {
        rowData.push(row.get(colIndex) || '');
      }

      tableRows.push(rowData);
    }

    return {
      rows: tableRows,
      confidence: cellCount > 0 ? totalConfidence / cellCount : 0,
    };
  }

  /**
   * Get text content from a block by following CHILD relationships to WORD blocks
   */
  private getTextFromBlock(block: Block, blockMap: Map<string, Block>): string {
    const wordIds = this.getChildIds(block, 'CHILD');
    const words: string[] = [];

    for (const wordId of wordIds) {
      const wordBlock = blockMap.get(wordId);
      if (wordBlock) {
        if (wordBlock.BlockType === BlockType.WORD) {
          words.push(wordBlock.Text || '');
        } else if (wordBlock.BlockType === BlockType.SELECTION_ELEMENT) {
          words.push(wordBlock.SelectionStatus === 'SELECTED' ? '[X]' : '[ ]');
        }
      }
    }

    return words.join(' ');
  }

  /**
   * Get the VALUE block for a KEY block
   */
  private getValueBlock(keyBlock: Block, blockMap: Map<string, Block>): Block | null {
    const valueIds = this.getChildIds(keyBlock, 'VALUE');
    
    for (const valueId of valueIds) {
      const valueBlock = blockMap.get(valueId);
      if (valueBlock && 
          valueBlock.BlockType === BlockType.KEY_VALUE_SET &&
          valueBlock.EntityTypes?.includes('VALUE')) {
        return valueBlock;
      }
    }

    return null;
  }

  /**
   * Get child IDs from a block's relationships
   */
  private getChildIds(block: Block, relationshipType: string): string[] {
    const ids: string[] = [];
    
    for (const relationship of block.Relationships || []) {
      if (relationship.Type === relationshipType && relationship.Ids) {
        ids.push(...relationship.Ids);
      }
    }

    return ids;
  }
}

// Singleton instance
let textractServiceInstance: TextractService | null = null;

export function getTextractService(): TextractService {
  if (!textractServiceInstance) {
    textractServiceInstance = new TextractService();
  }
  return textractServiceInstance;
}
