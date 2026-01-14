/**
 * Script para generar una imagen PNG de prueba para Textract
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

// Crear un PDF y convertirlo a imagen
// Como alternativa, creamos un HTML simple

const outputPath = path.join(process.cwd(), 'test-document.html');

const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Factura de Prueba</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
    h1 { text-align: center; color: #333; }
    .header { text-align: center; margin-bottom: 30px; }
    .info { margin: 20px 0; }
    .info p { margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
    th { background-color: #f5f5f5; }
    .totals { text-align: right; margin-top: 20px; }
    .total-row { font-weight: bold; font-size: 18px; }
    .bank-info { background: #f9f9f9; padding: 15px; margin-top: 30px; border-radius: 5px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>FACTURA</h1>
    <p><strong>N° 0001-00012345</strong></p>
  </div>
  
  <div class="info">
    <p><strong>Empresa Ejemplo S.A.</strong></p>
    <p>Av. Corrientes 1234, CABA</p>
    <p>CUIT: 30-12345678-9</p>
    <p>Tel: +54 11 4567-8900</p>
  </div>
  
  <hr>
  
  <div class="info">
    <p><strong>Cliente:</strong> Juan Pérez</p>
    <p><strong>DNI:</strong> 30.456.789</p>
    <p><strong>Email:</strong> juan.perez@email.com</p>
    <p><strong>Fecha de emisión:</strong> 15/01/2026</p>
    <p><strong>Fecha de vencimiento:</strong> 15/02/2026</p>
  </div>
  
  <table>
    <thead>
      <tr>
        <th>Descripción</th>
        <th>Cantidad</th>
        <th>Precio Unit.</th>
        <th>Subtotal</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Consultoría en sistemas</td>
        <td>10 hs</td>
        <td>$150.00</td>
        <td>$1,500.00</td>
      </tr>
      <tr>
        <td>Desarrollo de software</td>
        <td>20 hs</td>
        <td>$200.00</td>
        <td>$4,000.00</td>
      </tr>
      <tr>
        <td>Soporte técnico mensual</td>
        <td>1</td>
        <td>$800.00</td>
        <td>$800.00</td>
      </tr>
      <tr>
        <td>Licencia de software</td>
        <td>5</td>
        <td>$100.00</td>
        <td>$500.00</td>
      </tr>
    </tbody>
  </table>
  
  <div class="totals">
    <p>Subtotal: $6,800.00</p>
    <p>IVA (21%): $1,428.00</p>
    <p class="total-row">TOTAL: $8,228.00</p>
  </div>
  
  <div class="bank-info">
    <p><strong>Datos para transferencia:</strong></p>
    <p>Banco: Banco Santander Río</p>
    <p>Titular: Empresa Ejemplo S.A.</p>
    <p>CBU: 0720000088000012345678</p>
    <p>Alias: EMPRESA.EJEMPLO.PAGO</p>
  </div>
</body>
</html>
`;

fs.writeFileSync(outputPath, htmlContent);

console.log('========================================');
console.log('  Documento HTML generado');
console.log('========================================\n');
console.log(`Archivo: ${outputPath}\n`);
console.log('Para crear el PDF/imagen:');
console.log('1. Abrí el archivo HTML en Chrome');
console.log('2. Presioná Ctrl+P (imprimir)');
console.log('3. Elegí "Guardar como PDF" o "Microsoft Print to PDF"');
console.log('4. Guardalo como "test-invoice.pdf"');
console.log('\nO simplemente usá una factura real que tengas en PDF.');
