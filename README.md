# Email Document Extractor POC

Agente de IA que monitorea Gmail, extrae datos de documentos adjuntos usando AWS Textract, y persiste la información en PostgreSQL.

## Stack Tecnológico

- **Runtime**: Node.js 20+ / TypeScript
- **Framework Agente**: Google ADK (`@google/adk`)
- **Email**: Gmail API (OAuth2)
- **OCR/Extracción**: AWS Textract
- **Base de Datos**: PostgreSQL
- **ORM**: Prisma

## Requisitos Previos

1. Node.js 20 o superior
2. PostgreSQL instalado y corriendo
3. Cuenta de AWS con acceso a Textract
4. Proyecto en Google Cloud Console con Gmail API habilitada
5. Credenciales OAuth2 de Google

## Instalación

```bash
# Instalar dependencias
npm install

# Copiar variables de entorno
cp .env.example .env

# Editar .env con tus credenciales

# Generar cliente Prisma
npm run db:generate

# Aplicar schema a la base de datos
npm run db:push
```

## Configuración

### 1. AWS Textract

1. Crear un usuario IAM con permisos de Textract
2. Generar Access Key y Secret Key
3. Agregar las credenciales al archivo `.env`

### 2. Gmail API

1. Ir a [Google Cloud Console](https://console.cloud.google.com/)
2. Crear un proyecto nuevo
3. Habilitar Gmail API
4. Crear credenciales OAuth2 (tipo "Desktop App" o "Web Application")
5. Descargar las credenciales y configurar en `.env`
6. Para obtener el refresh token, ejecutar el flujo OAuth2 una vez

### 3. PostgreSQL

1. Crear una base de datos llamada `email_extractor`
2. Configurar la URL de conexión en `.env`

## Uso

```bash
# Modo desarrollo
npm run dev

# Producción
npm run build
npm start
```

## Estructura del Proyecto

```
src/
├── agent/
│   ├── index.ts           # Definición del agente ADK
│   └── prompts.ts         # System prompts del agente
├── tools/
│   ├── gmail.tool.ts      # Tool para leer emails
│   ├── textract.tool.ts   # Tool para extraer datos con Textract
│   └── database.tool.ts   # Tool para guardar en PostgreSQL
├── services/
│   ├── gmail.service.ts   # Lógica Gmail API
│   ├── textract.service.ts# Lógica AWS Textract
│   └── email.service.ts   # Envío de notificaciones
├── db/
│   └── schema.prisma      # Schema de la BD
└── index.ts               # Entry point
```

## Flujo de Procesamiento

1. El agente consulta Gmail cada X minutos (configurable)
2. Detecta emails no leídos con archivos adjuntos
3. Descarga los PDFs adjuntos
4. Envía cada PDF a AWS Textract
5. Extrae texto, tablas y pares clave-valor
6. Guarda los datos estructurados en PostgreSQL
7. Envía notificación por email con el resumen

## Licencia

MIT
