import { 
  S3Client, 
  PutObjectCommand, 
  DeleteObjectCommand 
} from '@aws-sdk/client-s3';
import { config } from '../config';
import { randomUUID } from 'crypto';

export class S3Service {
  private client: S3Client;
  private bucketName: string;

  constructor() {
    this.client = new S3Client({
      region: config.aws.region,
      credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
      },
    });
    this.bucketName = config.aws.s3Bucket;
  }

  /**
   * Upload a document to S3
   * Returns the S3 key (path) of the uploaded file
   */
  async uploadDocument(
    data: Buffer, 
    filename: string, 
    contentType: string
  ): Promise<{ bucket: string; key: string }> {
    const key = `documents/${Date.now()}-${randomUUID()}-${filename}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: data,
      ContentType: contentType,
    });

    await this.client.send(command);
    
    console.log(`Uploaded to S3: s3://${this.bucketName}/${key}`);
    
    return {
      bucket: this.bucketName,
      key,
    };
  }

  /**
   * Delete a document from S3
   */
  async deleteDocument(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    await this.client.send(command);
    console.log(`Deleted from S3: ${key}`);
  }

  /**
   * Get the bucket name
   */
  getBucketName(): string {
    return this.bucketName;
  }
}

// Singleton instance
let s3ServiceInstance: S3Service | null = null;

export function getS3Service(): S3Service {
  if (!s3ServiceInstance) {
    s3ServiceInstance = new S3Service();
  }
  return s3ServiceInstance;
}
