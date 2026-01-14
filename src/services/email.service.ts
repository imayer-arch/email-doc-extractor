import nodemailer from 'nodemailer';
import { config } from '../config';
import { ExtractionResult } from './textract.service';

export interface NotificationData {
  emailId: string;
  emailSubject: string;
  emailFrom: string;
  fileName: string;
  extractionResult: ExtractionResult;
}

export class EmailNotificationService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });
  }

  /**
   * Send extraction notification email
   */
  async sendExtractionNotification(data: NotificationData): Promise<void> {
    const htmlContent = this.generateHtmlReport(data);
    const textContent = this.generateTextReport(data);

    try {
      await this.transporter.sendMail({
        from: config.smtp.user,
        to: config.smtp.notificationEmail,
        subject: `📄 Documento Extraído: ${data.fileName}`,
        text: textContent,
        html: htmlContent,
      });

      console.log(`Notification sent for document: ${data.fileName}`);
    } catch (error) {
      console.error('Error sending notification email:', error);
      throw error;
    }
  }

  /**
   * Generate HTML report for email
   */
  private generateHtmlReport(data: NotificationData): string {
    const { extractionResult, emailSubject, emailFrom, fileName } = data;

    let keyValueHtml = '';
    if (extractionResult.keyValuePairs.length > 0) {
      keyValueHtml = `
        <h3>📋 Datos Extraídos (Key-Value)</h3>
        <table style="border-collapse: collapse; width: 100%; margin-bottom: 20px;">
          <thead>
            <tr style="background-color: #f2f2f2;">
              <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Campo</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Valor</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Confianza</th>
            </tr>
          </thead>
          <tbody>
            ${extractionResult.keyValuePairs.map(kv => `
              <tr>
                <td style="border: 1px solid #ddd; padding: 8px;"><strong>${this.escapeHtml(kv.key)}</strong></td>
                <td style="border: 1px solid #ddd; padding: 8px;">${this.escapeHtml(kv.value)}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${(kv.confidence).toFixed(1)}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    let tablesHtml = '';
    if (extractionResult.tables.length > 0) {
      tablesHtml = extractionResult.tables.map((table, index) => `
        <h3>📊 Tabla ${index + 1} (Confianza: ${table.confidence.toFixed(1)}%)</h3>
        <table style="border-collapse: collapse; width: 100%; margin-bottom: 20px;">
          ${table.rows.map((row, rowIndex) => `
            <tr style="${rowIndex === 0 ? 'background-color: #f2f2f2;' : ''}">
              ${row.map(cell => `
                <td style="border: 1px solid #ddd; padding: 8px;">${this.escapeHtml(cell)}</td>
              `).join('')}
            </tr>
          `).join('')}
        </table>
      `).join('');
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 800px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4CAF50; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
          .metadata { background-color: #e7e7e7; padding: 15px; margin-bottom: 20px; border-radius: 5px; }
          .raw-text { background-color: #fff; padding: 15px; border: 1px solid #ddd; border-radius: 5px; white-space: pre-wrap; font-family: monospace; font-size: 12px; max-height: 300px; overflow-y: auto; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔍 Extracción de Documento Completada</h1>
          </div>
          <div class="content">
            <div class="metadata">
              <p><strong>📧 Asunto del Email:</strong> ${this.escapeHtml(emailSubject)}</p>
              <p><strong>👤 De:</strong> ${this.escapeHtml(emailFrom)}</p>
              <p><strong>📄 Archivo:</strong> ${this.escapeHtml(fileName)}</p>
              <p><strong>📊 Confianza Promedio:</strong> ${extractionResult.averageConfidence.toFixed(1)}%</p>
            </div>
            
            ${keyValueHtml}
            ${tablesHtml}
            
            <h3>📝 Texto Completo Extraído</h3>
            <div class="raw-text">${this.escapeHtml(extractionResult.rawText)}</div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate plain text report
   */
  private generateTextReport(data: NotificationData): string {
    const { extractionResult, emailSubject, emailFrom, fileName } = data;

    let report = `
EXTRACCIÓN DE DOCUMENTO COMPLETADA
==================================

Email Original:
  Asunto: ${emailSubject}
  De: ${emailFrom}
  Archivo: ${fileName}
  Confianza Promedio: ${extractionResult.averageConfidence.toFixed(1)}%

`;

    if (extractionResult.keyValuePairs.length > 0) {
      report += `DATOS EXTRAÍDOS (Key-Value):\n`;
      report += '-'.repeat(40) + '\n';
      for (const kv of extractionResult.keyValuePairs) {
        report += `  ${kv.key}: ${kv.value} (${kv.confidence.toFixed(1)}%)\n`;
      }
      report += '\n';
    }

    if (extractionResult.tables.length > 0) {
      extractionResult.tables.forEach((table, index) => {
        report += `TABLA ${index + 1} (Confianza: ${table.confidence.toFixed(1)}%):\n`;
        report += '-'.repeat(40) + '\n';
        for (const row of table.rows) {
          report += `  ${row.join(' | ')}\n`;
        }
        report += '\n';
      });
    }

    report += `TEXTO COMPLETO:\n`;
    report += '-'.repeat(40) + '\n';
    report += extractionResult.rawText;

    return report;
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const htmlEntities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return text.replace(/[&<>"']/g, char => htmlEntities[char] || char);
  }

  /**
   * Verify SMTP connection
   */
  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('SMTP connection verification failed:', error);
      return false;
    }
  }
}

// Singleton instance
let emailServiceInstance: EmailNotificationService | null = null;

export function getEmailNotificationService(): EmailNotificationService {
  if (!emailServiceInstance) {
    emailServiceInstance = new EmailNotificationService();
  }
  return emailServiceInstance;
}
