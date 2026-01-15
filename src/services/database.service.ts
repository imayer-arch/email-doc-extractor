import { PrismaClient, ExtractedDocument, Prisma } from '@prisma/client';
import { ExtractionResult } from './textract.service';

export interface SaveDocumentData {
  emailId: string;
  emailSubject?: string;
  emailFrom?: string;
  emailDate?: Date;
  fileName: string;
  fileType?: string;
  extractionResult: ExtractionResult;
}

export class DatabaseService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Save extracted document data to database
   */
  async saveExtractedDocument(data: SaveDocumentData): Promise<ExtractedDocument> {
    try {
      const document = await this.prisma.extractedDocument.create({
        data: {
          emailId: data.emailId,
          emailSubject: data.emailSubject,
          emailFrom: data.emailFrom,
          emailDate: data.emailDate,
          fileName: data.fileName,
          fileType: data.fileType,
          rawText: data.extractionResult.rawText,
          structuredData: JSON.parse(JSON.stringify(data.extractionResult.keyValuePairs)),
          tablesData: JSON.parse(JSON.stringify(data.extractionResult.tables)),
          confidence: data.extractionResult.averageConfidence,
          status: 'completed',
        },
      });

      console.log(`Document saved with ID: ${document.id}`);
      return document;
    } catch (error) {
      console.error('Error saving document to database:', error);
      throw error;
    }
  }

  /**
   * Mark a document as having error
   */
  async markDocumentError(
    emailId: string, 
    fileName: string, 
    errorMessage: string
  ): Promise<ExtractedDocument> {
    try {
      const document = await this.prisma.extractedDocument.create({
        data: {
          emailId,
          fileName,
          status: 'error',
          errorMessage,
        },
      });

      return document;
    } catch (error) {
      console.error('Error marking document as error:', error);
      throw error;
    }
  }

  /**
   * Update document notification status
   */
  async markAsNotified(documentId: string): Promise<void> {
    try {
      await this.prisma.extractedDocument.update({
        where: { id: documentId },
        data: { notifiedAt: new Date() },
      });
    } catch (error) {
      console.error('Error updating notification status:', error);
      throw error;
    }
  }

  /**
   * Check if an email has already been processed
   */
  async isEmailProcessed(emailId: string): Promise<boolean> {
    const processed = await this.prisma.processedEmail.findUnique({
      where: { emailId },
    });
    return processed !== null;
  }

  /**
   * Mark email as processed
   */
  async markEmailProcessed(emailId: string): Promise<void> {
    try {
      await this.prisma.processedEmail.upsert({
        where: { emailId },
        create: { emailId },
        update: {},
      });
    } catch (error) {
      console.error('Error marking email as processed:', error);
      throw error;
    }
  }

  /**
   * Get all extracted documents with optional filters
   */
  async getExtractedDocuments(options?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<ExtractedDocument[]> {
    return this.prisma.extractedDocument.findMany({
      where: options?.status ? { status: options.status } : undefined,
      take: options?.limit,
      skip: options?.offset,
      orderBy: { extractedAt: 'desc' },
    });
  }

  /**
   * Get document by ID
   */
  async getDocumentById(id: string): Promise<ExtractedDocument | null> {
    return this.prisma.extractedDocument.findUnique({
      where: { id },
    });
  }

  /**
   * Get extraction statistics
   */
  async getExtractionStats(): Promise<{
    total: number;
    completed: number;
    errors: number;
    avgConfidence: number;
  }> {
    const [total, completed, errors, avgResult] = await Promise.all([
      this.prisma.extractedDocument.count(),
      this.prisma.extractedDocument.count({ where: { status: 'completed' } }),
      this.prisma.extractedDocument.count({ where: { status: 'error' } }),
      this.prisma.extractedDocument.aggregate({
        _avg: { confidence: true },
        where: { status: 'completed' },
      }),
    ]);

    return {
      total,
      completed,
      errors,
      avgConfidence: avgResult._avg.confidence || 0,
    };
  }

  /**
   * Get recent documents
   */
  async getRecentDocuments(limit: number = 50, status?: string): Promise<ExtractedDocument[]> {
    const where = status && status !== 'all' ? { status } : {};
    
    return this.prisma.extractedDocument.findMany({
      where,
      orderBy: { extractedAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Delete a single document by ID
   */
  async deleteDocument(id: string): Promise<void> {
    await this.prisma.extractedDocument.delete({
      where: { id },
    });
    console.log(`Document ${id} deleted`);
  }

  /**
   * Delete multiple documents by IDs
   */
  async deleteDocuments(ids: string[]): Promise<{ count: number }> {
    const result = await this.prisma.extractedDocument.deleteMany({
      where: {
        id: { in: ids },
      },
    });
    console.log(`${result.count} documents deleted`);
    return result;
  }

  /**
   * Disconnect from database
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

// Singleton instance
let databaseServiceInstance: DatabaseService | null = null;

export function getDatabaseService(): DatabaseService {
  if (!databaseServiceInstance) {
    databaseServiceInstance = new DatabaseService();
  }
  return databaseServiceInstance;
}
