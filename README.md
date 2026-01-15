# Email Document Extractor POC

Agente de IA que monitorea Gmail, extrae datos de documentos adjuntos usando AWS Textract, y persiste la información en PostgreSQL. Incluye una UI moderna en Next.js para visualizar y gestionar los documentos extraídos.

## Stack Tecnológico

### Backend
- **Runtime**: Node.js 20+ / TypeScript
- **API Server**: Express.js
- **Framework Agente**: Google ADK (`@google/adk`) con Gemini 2.0
- **Email**: Gmail API (OAuth2)
- **OCR/Extracción**: AWS Textract + S3
- **Base de Datos**: PostgreSQL
- **ORM**: Prisma

### Frontend
- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **Estado**: Zustand + TanStack Query
- **Auth**: NextAuth.js v5 (Google OAuth)
- **Animaciones**: Framer Motion

## Arquitectura

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│   Backend API   │────▶│   PostgreSQL    │
│   (Next.js)     │     │   (Express)     │     │                 │
│   :3001         │     │   :3000         │     │                 │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                │
           ┌────────────────────┼────────────────────┐
           ▼                    ▼                    ▼
     ┌──────────┐         ┌──────────┐         ┌──────────┐
     │ Pub/Sub  │────────▶│  Redis   │◀────────│  Worker  │
     │ (GCP)    │         │ (BullMQ) │         │          │
     └──────────┘         └──────────┘         └────┬─────┘
                                                    │
                          ┌─────────────────────────┼─────────────────────────┐
                          ▼                         ▼                         ▼
                    ┌──────────┐              ┌──────────┐              ┌──────────┐
                    │ Gmail    │              │ AWS S3   │              │ Textract │
                    │ API      │              │          │              │          │
                    └──────────┘              └──────────┘              └──────────┘
```

### Sistema de Colas (BullMQ + Redis)

El procesamiento de emails usa un sistema de colas para mejor escalabilidad:

1. **Webhook** recibe notificación de Pub/Sub → encola job en Redis
2. **Email Worker** procesa el job → obtiene emails de Gmail → encola attachments
3. **Attachment Worker** procesa cada adjunto → Textract → guarda en DB

Esto permite:
- Procesamiento paralelo de múltiples adjuntos
- Reintentos automáticos en caso de fallo
- Monitoreo de colas en Bull Board (`/admin/queues`)

### Procesamiento Automático (Gmail Push)

El sistema soporta **procesamiento automático** de emails usando Gmail Push Notifications:

1. **Gmail Watch API** registra una "watch" en el inbox del usuario
2. **Google Cloud Pub/Sub** recibe notificaciones cuando llegan nuevos emails
3. **Webhook** (`/api/webhook/gmail`) procesa automáticamente los adjuntos
4. **Triple protección** contra duplicados (lock en memoria + check en DB + marca inmediata)

## Requisitos Previos

1. Node.js 20 o superior
2. PostgreSQL instalado y corriendo
3. Cuenta de AWS con acceso a Textract y S3
4. Proyecto en Google Cloud Console con Gmail API habilitada
5. Credenciales OAuth2 de Google
6. API Key de Google AI (Gemini) - para el agente ADK
7. Google Cloud Pub/Sub configurado (para procesamiento automático)

## Instalación

### Backend

```bash
# Instalar dependencias
npm install

# Copiar variables de entorno
cp env.example .env
# Editar .env con tus credenciales

# Generar cliente Prisma
npm run db:generate

# Aplicar schema a la base de datos
npm run db:push
```

### Frontend

```bash
cd frontend

# Instalar dependencias
npm install

# Copiar variables de entorno
cp env.example .env
# Editar .env con tus credenciales

# Generar cliente Prisma (usa el schema del backend)
npx prisma generate
```

## Configuración

### 1. AWS (Textract + S3)

1. Crear un usuario IAM con permisos de `AmazonTextractFullAccess` y `AmazonS3FullAccess`
2. Crear un bucket S3 para almacenar temporalmente los documentos
3. Generar Access Key y Secret Key
4. Agregar las credenciales al archivo `.env`

> **Nota**: S3 es necesario porque Textract requiere que los documentos multi-página estén en S3 para procesamiento asíncrono.

### 2. Gmail API

1. Ir a [Google Cloud Console](https://console.cloud.google.com/)
2. Crear un proyecto nuevo
3. Habilitar Gmail API
4. Crear credenciales OAuth2 (tipo "Web Application")
5. Configurar redirect URI: `http://localhost:3000/oauth/callback`
6. Descargar las credenciales y configurar en `.env`
7. Ejecutar `npm run auth` para obtener el refresh token

### 3. Google AI (Gemini)

1. Ir a [Google AI Studio](https://aistudio.google.com/)
2. Crear una API Key
3. Agregar como `GOOGLE_API_KEY` en `.env`

> **⚠️ Nota**: El tier gratuito de Gemini tiene límites de cuota. Si recibes error 429, espera unos minutos o considera habilitar billing.

### 4. PostgreSQL

1. Crear una base de datos llamada `email_extractor`
2. Configurar la URL de conexión en `.env`

## Desarrollo

Para desarrollo local, necesitas ejecutar ambos servidores:

### Terminal 1 - Backend (Express API)
```bash
npm run server
# Corre en http://localhost:3000
```

### Terminal 2 - Worker (Procesamiento de colas)
```bash
npm run worker
# Procesa emails y attachments en background
# Expone métricas en http://localhost:9465/metrics
```

### Terminal 3 - Frontend (Next.js)
```bash
cd frontend
npm run dev
# Corre en http://localhost:3001
```

### Terminal 4 - Observability Stack (opcional)
```bash
docker-compose -f docker-compose.observability.yml up -d
# Grafana: http://localhost:3002
# Prometheus: http://localhost:9090
# Jaeger: http://localhost:16686
```

## Scripts Disponibles

### Backend
```bash
npm run dev          # Ejecutar agente ADK (modo desarrollo)
npm run server       # Iniciar servidor Express API
npm run worker       # Iniciar worker de procesamiento (BullMQ)
npm run worker:dev   # Worker con auto-reload
npm run server:sync  # Server sin colas (procesamiento directo)
npm run build        # Compilar TypeScript
npm run process      # Procesar emails manualmente
npm run auth         # Obtener refresh token de Gmail
npm run db:generate  # Generar cliente Prisma
npm run db:push      # Aplicar cambios de schema
npm run db:studio    # Abrir Prisma Studio
```

### Frontend
```bash
npm run dev          # Iniciar en modo desarrollo
npm run build        # Build de producción
npm start            # Iniciar build de producción
```

## Endpoints del Backend API

### Core
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/emails` | Listar emails con adjuntos pendientes |
| POST | `/api/process` | Disparar procesamiento manual |
| GET | `/api/stats` | Obtener estadísticas |
| GET | `/api/documents` | Listar documentos extraídos |
| GET | `/api/documents/:id` | Obtener detalle de documento |
| DELETE | `/api/documents/:id` | Eliminar documento |
| POST | `/api/documents/delete-batch` | Eliminar múltiples documentos |
| POST | `/api/chat` | Chat con agente ADK |

### Gmail Push (Procesamiento Automático)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/webhook/gmail` | Webhook para Pub/Sub (llamado por Google) |
| POST | `/api/gmail/watch/start` | Iniciar watch en Gmail |
| POST | `/api/gmail/watch/stop` | Detener watch |
| GET | `/api/gmail/watch/status` | Ver estado del watch |
| POST | `/api/gmail/watch/renew-all` | Renovar watches que expiran |

## Estructura del Proyecto

```
├── src/                       # Backend
│   ├── agent/                 # Agente ADK y prompts
│   ├── tools/                 # Tools del agente (Gmail, Textract, DB)
│   ├── services/              # Servicios
│   │   ├── gmail.service.ts         # Gmail API
│   │   ├── gmail-watch.service.ts   # Gmail Watch (Push)
│   │   ├── email-processor.service.ts # Procesador de emails
│   │   ├── textract.service.ts      # AWS Textract
│   │   └── database.service.ts      # PostgreSQL
│   ├── scripts/               # Scripts utilitarios
│   ├── config/                # Configuración
│   ├── server.ts              # Express API server
│   └── index.ts               # Entry point agente ADK
│
├── frontend/                  # Frontend Next.js
│   ├── src/
│   │   ├── app/               # App Router (pages, API routes)
│   │   ├── components/        # Componentes React
│   │   └── lib/               # Utilidades, stores, API client
│   └── ...
│
├── docs/                      # Documentación
│   └── GMAIL_PUSH_SETUP.md    # Setup de Gmail Push
│
├── prisma/
│   └── schema.prisma          # Schema de la BD
└── ...
```

## Flujo de Procesamiento

### Procesamiento Manual
1. **Usuario** hace clic en "Procesar Emails" en la UI
2. **Frontend** llama a `POST /api/process` del backend
3. **Backend** consulta Gmail API por emails no leídos con adjuntos
4. Para cada adjunto (PDF/imagen):
   - Sube el archivo a S3
   - Ejecuta Textract (análisis asíncrono)
   - Extrae texto, tablas y pares clave-valor
   - Guarda los datos estructurados en PostgreSQL
5. Marca el email como leído
6. **Frontend** actualiza automáticamente la lista de documentos

### Procesamiento Automático (Gmail Push)
1. **Usuario** conecta Gmail (OAuth) → se activa automáticamente el watch
2. **Gmail** detecta nuevo email → notifica a **Pub/Sub**
3. **Pub/Sub** envía POST al webhook `/api/webhook/gmail`
4. **Backend** procesa automáticamente:
   - Verifica si el email ya fue procesado (triple protección)
   - Extrae adjuntos con Textract
   - Guarda en PostgreSQL
   - Marca email como leído
5. **Frontend** muestra nuevos documentos (auto-refresh cada 30s)

> Ver `docs/GMAIL_PUSH_SETUP.md` para configuración detallada de Pub/Sub.

## TODOs

- [x] ~~Procesamiento automático con Gmail Push~~
- [ ] Notificaciones por email (AWS SES configurado pero pendiente de verificar identidades)
- [ ] Deploy a producción (Railway/Render)

## Licencia

MIT
