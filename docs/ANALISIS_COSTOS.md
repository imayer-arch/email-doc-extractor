# Análisis de Costos - Email Document Extractor

## Resumen Ejecutivo

Este documento detalla los costos operativos de la aplicación **Email Document Extractor**, incluyendo todos los servicios cloud utilizados, sus precios unitarios, y una proyección de costos para diferentes escenarios de uso empresarial.

---

## 1. Servicios Utilizados

| Servicio | Proveedor | Propósito | Documentación de Precios |
|----------|-----------|-----------|--------------------------|
| **Textract** | AWS | Extracción de texto, tablas y datos de documentos | [AWS Textract Pricing](https://aws.amazon.com/textract/pricing/) |
| **S3** | AWS | Almacenamiento temporal de documentos para procesamiento | [AWS S3 Pricing](https://aws.amazon.com/s3/pricing/) |
| **SES** | AWS | Envío de notificaciones por email (**NO activo**) | [AWS SES Pricing](https://aws.amazon.com/ses/pricing/) |
| **Gmail API** | Google Cloud | Lectura de emails y adjuntos | [Gmail API Quotas](https://developers.google.com/gmail/api/reference/quota) |
| **Gemini API** | Google AI | Agente de IA para procesamiento inteligente (**NO activo**) | [Gemini API Pricing](https://ai.google.dev/pricing) |
| **PostgreSQL** | Variable | Base de datos para almacenar resultados | Depende del proveedor |
| **Hosting** | Variable | Servidor para backend y frontend | Depende del proveedor |

---

## 1.1 Estado Actual de Servicios

| Servicio | Estado | Genera Costos? |
|----------|--------|----------------|
| **AWS Textract** | ✅ ACTIVO | Sí - Principal costo |
| **AWS S3** | ✅ ACTIVO | Sí - Mínimo |
| **Gmail API** | ✅ ACTIVO | No - Gratuito |
| **PostgreSQL** | ✅ ACTIVO | Sí - Hosting |
| **Hosting (Frontend/Backend)** | ✅ ACTIVO | Sí - Hosting |
| **AWS SES** | ❌ NO ACTIVO | No - Código preparado |
| **Gemini API (ADK)** | ❌ NO ACTIVO | No - Límite de cuota |

> **Nota:** Los servicios marcados como "NO ACTIVO" tienen el código implementado pero no se ejecutan en el flujo actual. Pueden activarse en el futuro.

### Funcionalidades NO activas - ¿Qué harían si se activan?

#### AWS SES - Notificaciones por Email
Si se activa, el sistema enviaría automáticamente un email de notificación cada vez que se procesa un documento. El email incluiría:

- **Asunto:** "📄 Documento Extraído: [nombre_archivo]"
- **Contenido:**
  - Datos del email original (remitente, fecha, asunto)
  - Resumen de datos extraídos (campos clave-valor)
  - Tablas detectadas
  - Porcentaje de confianza de la extracción
  - Link para ver el documento completo en la UI

**Caso de uso:** Útil para alertar a un supervisor o equipo cuando llegan documentos importantes (facturas, contratos, etc.)

**Costo estimado adicional:** ~$0.10/1,000 notificaciones

---

#### Gemini API (Google ADK) - Agente de IA Inteligente
Si se activa, el chat pasaría de respuestas predefinidas a un agente de IA capaz de:

| Funcionalidad | Descripción |
|---------------|-------------|
| **Procesamiento por comando** | "Procesa el email de Juan sobre la factura" → El agente busca, extrae y guarda automáticamente |
| **Búsqueda inteligente** | "¿Cuánto pagamos a Proveedor X el mes pasado?" → Busca en documentos extraídos |
| **Resúmenes automáticos** | "Dame un resumen de las facturas de esta semana" → Genera reporte |
| **Acciones encadenadas** | "Procesa todos los emails pendientes y envíame un resumen" → Múltiples pasos |
| **Contexto conversacional** | Recuerda la conversación y permite preguntas de seguimiento |

**Tools disponibles en el agente:**
```
- checkEmails: Revisar bandeja de entrada
- getEmailAttachment: Obtener adjunto específico  
- extractDocumentData: Extraer con Textract
- saveExtractedData: Guardar en PostgreSQL
- getExtractionStats: Obtener estadísticas
- sendExtractionNotification: Enviar notificación (requiere SES)
```

**Caso de uso:** Automatización completa mediante lenguaje natural. El usuario dice qué quiere y el agente ejecuta las acciones.

**Costo estimado adicional:** ~$0-5/mes con Free Tier, ~$10-20/mes con uso moderado

---

## 2. Detalle de Precios por Servicio

### 2.1 AWS Textract

AWS Textract cobra por página procesada, con diferentes precios según el tipo de análisis:

| Tipo de Análisis | Precio por Página | Descripción |
|------------------|-------------------|-------------|
| **Detect Document Text** | $0.0015 | Solo extracción de texto |
| **Analyze Document (Forms)** | $0.05 | Texto + pares clave-valor |
| **Analyze Document (Tables)** | $0.015 | Texto + tablas |
| **Analyze Document (Forms + Tables)** | $0.065 | Texto + clave-valor + tablas |

> **Nota:** Esta aplicación usa **Forms + Tables** ($0.065/página) para extracción completa.

**Free Tier:** 1,000 páginas/mes gratis los primeros 3 meses.

📎 [Documentación oficial de precios Textract](https://aws.amazon.com/textract/pricing/)

---

### 2.2 AWS S3

S3 se usa para almacenamiento temporal de documentos antes del procesamiento con Textract.

| Concepto | Precio |
|----------|--------|
| **Almacenamiento (Standard)** | $0.023/GB/mes |
| **PUT requests** | $0.005/1,000 requests |
| **GET requests** | $0.0004/1,000 requests |
| **Data Transfer OUT** | $0.09/GB (primeros 10TB) |

> **Nota:** Los documentos se eliminan después del procesamiento, minimizando costos de almacenamiento.

**Free Tier:** 5GB almacenamiento + 20,000 GET + 2,000 PUT/mes (12 meses).

📎 [Documentación oficial de precios S3](https://aws.amazon.com/s3/pricing/)

---

### 2.3 AWS SES (Simple Email Service)

> ⚠️ **ESTADO ACTUAL: NO ACTIVO**  
> El código está preparado pero las notificaciones por email no se ejecutan en el flujo actual.
> Costo actual: **$0**

Para envío de notificaciones por email (si se activa en el futuro):

| Concepto | Precio |
|----------|--------|
| **Emails enviados** | $0.10/1,000 emails |
| **Adjuntos** | $0.12/GB de datos |

**Free Tier:** 62,000 emails/mes si se envía desde EC2.

📎 [Documentación oficial de precios SES](https://aws.amazon.com/ses/pricing/)

---

### 2.4 Google Gmail API

La Gmail API es **gratuita** con límites de cuota:

| Límite | Valor |
|--------|-------|
| **Cuota diaria** | 1,000,000,000 unidades/día |
| **Por usuario/segundo** | 250 unidades |
| **Lectura de mensaje** | 5 unidades |
| **Lectura de adjunto** | 5 unidades |

> **Costo: $0** - Solo requiere proyecto en Google Cloud Console (gratuito).

📎 [Documentación oficial de cuotas Gmail API](https://developers.google.com/gmail/api/reference/quota)

---

### 2.5 Google Gemini API

> ⚠️ **ESTADO ACTUAL: NO ACTIVO**  
> El agente ADK está configurado pero desactivado debido a límites de cuota del Free Tier.
> El chat funciona con respuestas predefinidas sin IA.
> Costo actual: **$0**

Para el agente de IA (ADK) que procesa consultas inteligentes (si se activa en el futuro):

| Modelo | Precio Input | Precio Output |
|--------|--------------|---------------|
| **Gemini 2.0 Flash** | $0.10/1M tokens | $0.40/1M tokens |
| **Gemini 1.5 Flash** | $0.075/1M tokens | $0.30/1M tokens |
| **Gemini 1.5 Pro** | $1.25/1M tokens | $5.00/1M tokens |

**Free Tier (límites que causaron la desactivación):** 
- 15 requests por minuto (RPM)
- 1,500 requests por día (RPD)
- 1,000,000 tokens por minuto (TPM)

> **Nota:** Para producción se recomienda habilitar billing para evitar errores 429.

📎 [Documentación oficial de precios Gemini](https://ai.google.dev/pricing)

---

### 2.6 PostgreSQL (Base de Datos)

Opciones de hosting:

| Proveedor | Plan | Precio/mes | Incluye |
|-----------|------|------------|---------|
| **Supabase** | Free | $0 | 500MB, 2 proyectos |
| **Supabase** | Pro | $25 | 8GB, backups diarios |
| **Railway** | Starter | $5 | 1GB, auto-scaling |
| **Neon** | Free | $0 | 512MB, branching |
| **AWS RDS** | db.t3.micro | ~$15 | 20GB, single AZ |

📎 [Supabase Pricing](https://supabase.com/pricing) | [Railway Pricing](https://railway.app/pricing) | [Neon Pricing](https://neon.tech/pricing)

---

### 2.7 Hosting (Frontend + Backend)

| Proveedor | Plan | Precio/mes | Ideal para |
|-----------|------|------------|------------|
| **Vercel** | Hobby | $0 | Frontend (Next.js) |
| **Vercel** | Pro | $20/usuario | Producción |
| **Railway** | Starter | $5 + uso | Backend |
| **Render** | Free | $0 | Backend (spin down) |
| **AWS EC2** | t3.micro | ~$8 | Full control |

📎 [Vercel Pricing](https://vercel.com/pricing) | [Railway Pricing](https://railway.app/pricing)

---

## 3. Escenarios de Uso y Costos Proyectados

**Supuestos base para todos los escenarios:**
- Cada empleado recibe ~50 documentos/mes por email
- Documentos promedio: 3 páginas cada uno
- Servicios NO activos: Gemini API, AWS SES (costo $0)

---

### 3.1 Escenario A: Startup - 5 Usuarios

| Concepto | Cálculo | Cantidad | Precio Unit. | Total/Mes |
|----------|---------|----------|--------------|-----------|
| **Documentos procesados** | 5 usuarios × 50 docs | 250 docs | - | - |
| **Páginas totales** | 250 docs × 3 págs | 750 páginas | - | - |
| **AWS Textract** | 750 páginas | 750 | $0.065 | **$48.75** |
| **AWS S3 Storage** | ~250MB temporal | 0.25 GB | $0.023 | **$0.01** |
| **AWS S3 Requests** | PUT + GET | ~500 | $0.005/1K | **$0.01** |
| **Gmail API** | Gratuito | - | $0 | **$0.00** |
| **Gemini API** | NO ACTIVO | - | $0 | **$0.00** |
| **AWS SES** | NO ACTIVO | - | $0 | **$0.00** |
| **PostgreSQL (Supabase Free)** | Free tier | 1 | $0 | **$0.00** |
| **Hosting (Vercel Free + Render)** | Free tiers | 1 | $0 | **$0.00** |
| | | | **TOTAL** | **$48.77** |

```
┌─────────────────────────────────────────────────────────────────┐
│           ESCENARIO A: 5 USUARIOS - ~$49/mes                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ████████████████████████████████████████  AWS Textract  99.9% │
│  ░                                         S3/Otros       0.1% │
│                                                                 │
│  💡 Usando Free Tiers: PostgreSQL y Hosting = $0               │
└─────────────────────────────────────────────────────────────────┘

Costo por documento: $48.77 / 250 = $0.20
Costo por usuario/mes: $48.77 / 5 = $9.75
```

---

### 3.2 Escenario B: PyME - 10 Usuarios

| Concepto | Cálculo | Cantidad | Precio Unit. | Total/Mes |
|----------|---------|----------|--------------|-----------|
| **Documentos procesados** | 10 usuarios × 50 docs | 500 docs | - | - |
| **Páginas totales** | 500 docs × 3 págs | 1,500 páginas | - | - |
| **AWS Textract** | 1,500 páginas | 1,500 | $0.065 | **$97.50** |
| **AWS S3 Storage** | ~500MB temporal | 0.5 GB | $0.023 | **$0.01** |
| **AWS S3 Requests** | PUT + GET | ~1,000 | $0.005/1K | **$0.01** |
| **Gmail API** | Gratuito | - | $0 | **$0.00** |
| **Gemini API** | NO ACTIVO | - | $0 | **$0.00** |
| **AWS SES** | NO ACTIVO | - | $0 | **$0.00** |
| **PostgreSQL (Supabase Free)** | Free tier | 1 | $0 | **$0.00** |
| **Hosting (Vercel Free + Railway)** | Starter | 1 | $5 | **$5.00** |
| | | | **TOTAL** | **$102.52** |

```
┌─────────────────────────────────────────────────────────────────┐
│           ESCENARIO B: 10 USUARIOS - ~$103/mes                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ████████████████████████████████████████  AWS Textract  95.1% │
│  ██                                        Hosting        4.9% │
│  ░                                         S3/Otros       0.0% │
│                                                                 │
│  💡 PostgreSQL Free Tier aún alcanza para este volumen         │
└─────────────────────────────────────────────────────────────────┘

Costo por documento: $102.52 / 500 = $0.21
Costo por usuario/mes: $102.52 / 10 = $10.25
```

---

### 3.3 Escenario C: Empresa - 20 Usuarios

| Concepto | Cálculo | Cantidad | Precio Unit. | Total/Mes |
|----------|---------|----------|--------------|-----------|
| **Documentos procesados** | 20 usuarios × 50 docs | 1,000 docs | - | - |
| **Páginas totales** | 1,000 docs × 3 págs | 3,000 páginas | - | - |
| **AWS Textract** | 3,000 páginas | 3,000 | $0.065 | **$195.00** |
| **AWS S3 Storage** | ~1GB temporal | 1 GB | $0.023 | **$0.02** |
| **AWS S3 Requests** | PUT + GET | ~2,000 | $0.005/1K | **$0.01** |
| **Gmail API** | Gratuito | - | $0 | **$0.00** |
| **Gemini API** | NO ACTIVO | - | $0 | **$0.00** |
| **AWS SES** | NO ACTIVO | - | $0 | **$0.00** |
| **PostgreSQL (Supabase Pro)** | Pro tier | 1 | $25 | **$25.00** |
| **Hosting (Vercel + Railway)** | Pro tiers | 1 | $25 | **$25.00** |
| | | | **TOTAL** | **$245.03** |

```
┌─────────────────────────────────────────────────────────────────┐
│           ESCENARIO C: 20 USUARIOS - ~$245/mes                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ████████████████████████████████████████  AWS Textract  79.5% │
│  ██████████                                PostgreSQL    10.2% │
│  ██████████                                Hosting       10.2% │
│  ░                                         S3/Otros       0.1% │
│                                                                 │
│  💡 Se recomienda plan Pro para mayor estabilidad              │
└─────────────────────────────────────────────────────────────────┘

Costo por documento: $245.03 / 1,000 = $0.25
Costo por usuario/mes: $245.03 / 20 = $12.25
```

---

### 3.4 Comparativa de Escenarios

| Escenario | Usuarios | Docs/Mes | Costo Total | Costo/Doc | Costo/Usuario |
|-----------|----------|----------|-------------|-----------|---------------|
| **A - Startup** | 5 | 250 | **$49/mes** | $0.20 | $9.75 |
| **B - PyME** | 10 | 500 | **$103/mes** | $0.21 | $10.25 |
| **C - Empresa** | 20 | 1,000 | **$245/mes** | $0.25 | $12.25 |

```
COMPARATIVA VISUAL DE COSTOS MENSUALES
──────────────────────────────────────────────────────────────────

5 usuarios   ████████                                    $49/mes
10 usuarios  ████████████████                           $103/mes  
20 usuarios  ████████████████████████████████████████   $245/mes

──────────────────────────────────────────────────────────────────
             $0      $50     $100    $150    $200    $250
```

---

### 3.5 Escala de Costos por Volumen (General)

| Docs/Mes | Páginas | Textract | DB + Hosting | **Total** |
|----------|---------|----------|--------------|-----------|
| 250 | 750 | $48.75 | $0 (free) | **$49** |
| 500 | 1,500 | $97.50 | $5 | **$103** |
| 1,000 | 3,000 | $195.00 | $50 | **$245** |
| 2,500 | 7,500 | $487.50 | $50 | **$538** |
| 5,000 | 15,000 | $975.00 | $75 | **$1,050** |
| 10,000 | 30,000 | $1,950.00 | $100 | **$2,050** |

---

### 3.6 Variantes de Costos: Con Servicios Adicionales

A continuación se muestran los costos si se activan los servicios actualmente desactivados.

#### Costos Adicionales por Servicio

| Servicio | Cálculo | 5 usuarios | 10 usuarios | 20 usuarios |
|----------|---------|------------|-------------|-------------|
| **Gemini API (AI)** | ~300-1000 requests/mes, Free Tier alcanza | $0* | $0* | $0* |
| **Gemini API (AI)** | Si excede Free Tier o quiere garantizado | $5 | $10 | $15 |
| **AWS SES** | 1 notificación/doc × $0.10/1000 emails | $0.03 | $0.05 | $0.10 |

> *El Free Tier de Gemini (1,500 requests/día) es suficiente para uso normal en todos los escenarios.
> Para garantizar disponibilidad en producción, se recomienda habilitar billing (~$5-15/mes).

---

#### ESCENARIO A: 5 Usuarios - Variantes de Costo

| Configuración | Base | + AI | + SES | **Pack Completo** |
|---------------|------|------|-------|-------------------|
| Textract + S3 | $48.77 | $48.77 | $48.77 | $48.77 |
| Gemini AI | - | $0-5 | - | $0-5 |
| AWS SES | - | - | $0.03 | $0.03 |
| **TOTAL** | **$49** | **$49-54** | **$49** | **$49-54** |

```
ESCENARIO A: 5 USUARIOS - VARIANTES
────────────────────────────────────────────────────────
Base (actual)      ████████████████████           $49
+ Solo AI          ████████████████████░          $49-54
+ Solo SES         ████████████████████           $49
Pack Completo      ████████████████████░          $49-54
────────────────────────────────────────────────────────
```

---

#### ESCENARIO B: 10 Usuarios - Variantes de Costo

| Configuración | Base | + AI | + SES | **Pack Completo** |
|---------------|------|------|-------|-------------------|
| Textract + S3 + Hosting | $102.52 | $102.52 | $102.52 | $102.52 |
| Gemini AI | - | $0-10 | - | $0-10 |
| AWS SES | - | - | $0.05 | $0.05 |
| **TOTAL** | **$103** | **$103-113** | **$103** | **$103-113** |

```
ESCENARIO B: 10 USUARIOS - VARIANTES
────────────────────────────────────────────────────────
Base (actual)      ████████████████████           $103
+ Solo AI          ████████████████████░░         $103-113
+ Solo SES         ████████████████████           $103
Pack Completo      ████████████████████░░         $103-113
────────────────────────────────────────────────────────
```

---

#### ESCENARIO C: 20 Usuarios - Variantes de Costo

| Configuración | Base | + AI | + SES | **Pack Completo** |
|---------------|------|------|-------|-------------------|
| Textract + S3 + DB + Hosting | $245.03 | $245.03 | $245.03 | $245.03 |
| Gemini AI | - | $0-15 | - | $0-15 |
| AWS SES | - | - | $0.10 | $0.10 |
| **TOTAL** | **$245** | **$245-260** | **$245** | **$245-260** |

```
ESCENARIO C: 20 USUARIOS - VARIANTES
────────────────────────────────────────────────────────
Base (actual)      ████████████████████           $245
+ Solo AI          ████████████████████░░░        $245-260
+ Solo SES         ████████████████████           $245
Pack Completo      ████████████████████░░░        $245-260
────────────────────────────────────────────────────────
```

---

#### Resumen: Pack Completo por Escenario

| Escenario | Base | + AI (garantizado) | + SES | **Pack Completo** |
|-----------|------|-------------------|-------|-------------------|
| **5 usuarios** | $49 | +$5 | +$0.03 | **$54** |
| **10 usuarios** | $103 | +$10 | +$0.05 | **$113** |
| **20 usuarios** | $245 | +$15 | +$0.10 | **$260** |

> **Nota sobre Gemini AI:**
> - Con Free Tier: $0 adicional (pero sujeto a límites de cuota)
> - Con billing habilitado: $5-15/mes (garantiza disponibilidad)
> - El costo real depende del uso; $5-15 es estimado conservador

> **Nota sobre AWS SES:**
> - Costo prácticamente insignificante ($0.10/1000 emails)
> - Menos de $1/mes incluso con 10,000 documentos

---

## 4. Optimizaciones de Costos

### 4.1 Reducir Costos de Textract

| Estrategia | Ahorro Potencial |
|------------|------------------|
| Usar solo "Detect Text" para docs simples | Hasta 97% ($0.0015 vs $0.065) |
| Preprocesar y filtrar páginas irrelevantes | 20-40% |
| Usar AWS Textract en regiones más baratas | 5-10% |
| Contratos de volumen (Savings Plans) | 10-20% |

### 4.2 Reducir Costos de Infraestructura

| Estrategia | Ahorro Potencial |
|------------|------------------|
| Self-hosted PostgreSQL | 100% del costo DB |
| Usar tiers gratuitos (Neon, Supabase Free) | $25/mes |
| Combinar frontend + backend en un solo servicio | ~$10/mes |

---

## 5. ROI y Justificación de la Inversión

### 5.1 ¿Qué es ROI?

**ROI (Return On Investment)** = Retorno de la Inversión

Mide cuánto dinero recuperas (o ahorras) por cada dólar invertido.

```
Fórmula: ROI = (Ahorro - Costo) / Costo × 100

Ejemplo:
- Gastas $245/mes en la app
- Ahorras $1,000/mes (vs hacerlo manual)
- ROI = ($1,000 - $245) / $245 × 100 = 308%
- Significa: Por cada $1 invertido, recuperas $3.08
```

---

### 5.2 ¿Qué es "Procesamiento Manual"?

Es el trabajo que haría un **empleado** si NO existiera esta aplicación:

#### Proceso MANUAL (sin la aplicación):

| Paso | Tarea del empleado | Tiempo |
|------|-------------------|--------|
| 1 | Abrir el email en Gmail/Outlook | 30 seg |
| 2 | Descargar el archivo adjunto (PDF/imagen) | 15 seg |
| 3 | Abrir el documento en visor de PDF | 15 seg |
| 4 | **Leer el documento completo** | 1-2 min |
| 5 | **Buscar datos:** fechas, montos, nombres, cuentas, etc. | 1-2 min |
| 6 | **Copiar datos manualmente** a Excel o sistema | 1-2 min |
| 7 | Guardar y archivar el documento | 30 seg |
| | **TOTAL por documento** | **~5 minutos** |

#### Proceso AUTOMÁTICO (con esta aplicación):

| Paso | Lo que hace la app | Tiempo |
|------|-------------------|--------|
| 1 | Usuario hace click en "Procesar Emails" | 1 seg |
| 2 | Sistema lee emails automáticamente | 2 seg |
| 3 | AWS Textract extrae TODOS los datos (texto, tablas, campos) | 20 seg |
| 4 | Datos guardados automáticamente en base de datos | 2 seg |
| 5 | Disponible en la UI para consultar/exportar | 0 seg |
| | **TOTAL por documento** | **~30 segundos** |

---

### 5.3 Comparativa: Manual vs Automático

| Aspecto | Manual (empleado) | Automático (app) |
|---------|-------------------|------------------|
| **Tiempo por documento** | 5 minutos | 30 segundos |
| **Requiere empleado dedicado** | Sí | No |
| **Errores humanos** | Posibles (typos, datos omitidos) | No hay |
| **Funciona 24/7** | No (horario laboral) | Sí |
| **Escalable** | Difícil (contratar más gente) | Fácil (solo pagar más) |
| **Costo por documento** | **$1.25** | **$0.25** |

#### ¿De dónde sale $1.25 manual?
```
Salario promedio empleado administrativo: $15/hora
Tiempo por documento: 5 minutos = 0.083 horas
Costo por documento: $15 × 0.083 = $1.25
```

---

### 5.4 Cálculo del Ahorro

```
┌─────────────────────────────────────────────────────────────────┐
│                    AHORRO POR DOCUMENTO                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Costo MANUAL (empleado):    $1.25                              │
│  Costo AUTOMÁTICO (app):     $0.25                              │
│  ────────────────────────────────                               │
│  AHORRO por documento:       $1.00 (80%)                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 5.5 Cálculo del ROI por Escenario

#### Escenario: 20 usuarios, 1,000 documentos/mes

```
Si procesaras 1,000 docs MANUALMENTE:
  1,000 docs × $1.25 = $1,250/mes (en salario de empleado)

Con esta APLICACIÓN:
  Costo de la app = $245/mes

AHORRO MENSUAL:
  $1,250 - $245 = $1,005/mes de ahorro

ROI = ($1,005 / $245) × 100 = 410%

💡 Por cada $1 invertido en la app, ahorras $4.10
```

#### ROI por todos los escenarios:

| Escenario | Docs/Mes | Costo Manual | Costo App | Ahorro | **ROI** |
|-----------|----------|--------------|-----------|--------|---------|
| 5 usuarios | 250 | $312.50 | $49 | $263.50 | **538%** |
| 10 usuarios | 500 | $625 | $103 | $522 | **507%** |
| 20 usuarios | 1,000 | $1,250 | $245 | $1,005 | **410%** |

> **Conclusión:** En TODOS los escenarios, la aplicación genera ahorro desde el primer mes. No hay "punto de equilibrio" que esperar porque no hay inversión inicial.

---

## 6. Resumen de Costos por Escenario

| Escenario | Usuarios | Docs/Mes | Costo/Mes | Costo/Doc | Costo/Usuario |
|-----------|----------|----------|-----------|-----------|---------------|
| **A - Startup** | 5 | 250 | **$49** | $0.20 | $9.75 |
| **B - PyME** | 10 | 500 | **$103** | $0.21 | $10.25 |
| **C - Empresa** | 20 | 1,000 | **$245** | $0.25 | $12.25 |
| **D - Mediana** | 50 | 2,500 | **$538** | $0.22 | $10.76 |
| **E - Enterprise** | 100+ | 10,000+ | **$2,050+** | $0.20 | ~$20 |

### Notas importantes:

1. **Escenarios A y B** pueden usar **Free Tiers** de PostgreSQL (Supabase/Neon), reduciendo costos significativamente
2. **El costo por documento baja** a mayor volumen (economía de escala en infraestructura)
3. **AWS Textract es el 80-99%** del costo total dependiendo del escenario
4. **Gmail API y servicios NO activos** = $0 en todos los escenarios

---

## 7. Referencias y Documentación

### AWS
- [AWS Textract Pricing](https://aws.amazon.com/textract/pricing/)
- [AWS S3 Pricing](https://aws.amazon.com/s3/pricing/)
- [AWS SES Pricing](https://aws.amazon.com/ses/pricing/)
- [AWS Pricing Calculator](https://calculator.aws/)

### Google Cloud
- [Gmail API Quotas](https://developers.google.com/gmail/api/reference/quota)
- [Gemini API Pricing](https://ai.google.dev/pricing)
- [Google Cloud Pricing Calculator](https://cloud.google.com/products/calculator)

### Hosting
- [Vercel Pricing](https://vercel.com/pricing)
- [Railway Pricing](https://railway.app/pricing)
- [Supabase Pricing](https://supabase.com/pricing)
- [Neon Pricing](https://neon.tech/pricing)

---

## 8. Conclusiones

1. **El costo principal es AWS Textract** (~80% del total)
2. **Gmail API y Gemini Free Tier** no generan costos significativos
3. **El costo por documento (~$0.25) es muy competitivo** vs procesamiento manual
4. **La escalabilidad es lineal** - sin costos fijos altos
5. **ROI positivo desde el primer mes** con ahorro de ~$1 por documento

---

*Documento generado: Enero 2026*  
*Última actualización de precios: Verificar links oficiales para precios actualizados*
