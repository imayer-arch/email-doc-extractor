/**
 * Script para generar un PDF de prueba
 * Run with: npx ts-node src/scripts/generate-test-pdf.ts
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

const outputPath = path.join(process.cwd(), 'test-invoice.pdf');

// Crear el documento PDF
const doc = new PDFDocument({ margin: 50 });

// Pipe al archivo
doc.pipe(fs.createWriteStream(outputPath));

// Header
doc.fontSize(24).font('Helvetica-Bold').text('FACTURA', { align: 'center' });
doc.moveDown(0.5);
doc.fontSize(14).font('Helvetica').text('N° 0001-00012345', { align: 'center' });

doc.moveDown(2);

// Información de la empresa
doc.fontSize(12).font('Helvetica-Bold').text('Empresa Ejemplo S.A.');
doc.font('Helvetica').text('Av. Corrientes 1234, CABA');
doc.text('CUIT: 30-12345678-9');
doc.text('Tel: +54 11 4567-8900');

doc.moveDown(1.5);

// Línea separadora
doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();

doc.moveDown(1);

// Información del cliente
doc.font('Helvetica-Bold').text('Cliente:');
doc.font('Helvetica').text('Juan Pérez');
doc.text('DNI: 30.456.789');
doc.text('Email: juan.perez@email.com');
doc.text('Dirección: Av. Santa Fe 5678, CABA');

doc.moveDown(1);

// Fecha y condiciones
doc.font('Helvetica-Bold').text('Fecha de emisión: ', { continued: true });
doc.font('Helvetica').text('15/01/2026');
doc.font('Helvetica-Bold').text('Fecha de vencimiento: ', { continued: true });
doc.font('Helvetica').text('15/02/2026');
doc.font('Helvetica-Bold').text('Condición de pago: ', { continued: true });
doc.font('Helvetica').text('30 días');

doc.moveDown(1.5);

// Tabla de items
const tableTop = doc.y;
const tableHeaders = ['Descripción', 'Cantidad', 'Precio Unit.', 'Subtotal'];
const colWidths = [220, 80, 100, 100];
let xPos = 50;

// Header de la tabla
doc.font('Helvetica-Bold').fontSize(11);
doc.rect(50, tableTop, 500, 25).fill('#f0f0f0');
doc.fillColor('#000');

tableHeaders.forEach((header, i) => {
  doc.text(header, xPos + 5, tableTop + 7, { width: colWidths[i] - 10 });
  xPos += colWidths[i];
});

// Datos de la tabla
const items = [
  ['Consultoría en sistemas', '10 hs', '$150.00', '$1,500.00'],
  ['Desarrollo de software', '20 hs', '$200.00', '$4,000.00'],
  ['Soporte técnico mensual', '1', '$800.00', '$800.00'],
  ['Licencia de software', '5', '$100.00', '$500.00'],
];

doc.font('Helvetica').fontSize(10);
let rowY = tableTop + 30;

items.forEach((row) => {
  xPos = 50;
  row.forEach((cell, i) => {
    doc.text(cell, xPos + 5, rowY, { width: colWidths[i] - 10 });
    xPos += colWidths[i];
  });
  rowY += 25;
});

// Línea final de tabla
doc.moveTo(50, rowY).lineTo(550, rowY).stroke();

doc.moveDown(4);

// Totales
const totalsX = 350;
doc.y = rowY + 20;

doc.font('Helvetica').fontSize(11);
doc.text('Subtotal:', totalsX, doc.y, { continued: true, width: 100 });
doc.text('$6,800.00', { align: 'right', width: 100 });

doc.text('IVA (21%):', totalsX, doc.y, { continued: true, width: 100 });
doc.text('$1,428.00', { align: 'right', width: 100 });

doc.moveDown(0.5);
doc.font('Helvetica-Bold').fontSize(14);
doc.text('TOTAL:', totalsX, doc.y, { continued: true, width: 100 });
doc.text('$8,228.00', { align: 'right', width: 100 });

doc.moveDown(3);

// Información bancaria
doc.font('Helvetica-Bold').fontSize(12).text('Datos para transferencia:');
doc.font('Helvetica').fontSize(11);
doc.text('Banco: Banco Santander Río');
doc.text('Titular: Empresa Ejemplo S.A.');
doc.text('CBU: 0720000088000012345678');
doc.text('Alias: EMPRESA.EJEMPLO.PAGO');
doc.text('CUIT: 30-12345678-9');

doc.moveDown(2);

// Nota al pie
doc.fontSize(9).fillColor('#666');
doc.text('Este documento es una factura electrónica válida según RG 4291 AFIP.', { align: 'center' });
doc.text('Gracias por su confianza.', { align: 'center' });

// Finalizar el PDF
doc.end();

console.log(`✓ PDF generado exitosamente: ${outputPath}`);
console.log('\nAhora podés enviar este archivo como adjunto a imayer@mobeats.io');
