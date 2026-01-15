import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { PrismaClient } from "@prisma/client";
import { GoogleGenerativeAI } from "@google/generative-ai";

const prisma = new PrismaClient();

// =============================================================================
// CONFIGURACIÓN DE GEMINI
// =============================================================================
const BACKEND_URL = process.env.BACKEND_API_URL || "http://localhost:3000";
const GEMINI_API_KEY = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY || "";

// Activar/desactivar Gemini
const USE_GEMINI = true;

// Estado de disponibilidad de Gemini (se actualiza en runtime)
let geminiAvailable = true;
let lastGeminiError: Date | null = null;
const GEMINI_RETRY_DELAY_MS = 60000; // Reintentar después de 60 segundos

// Tipo para respuesta
interface ChatResponse {
  message: string;
  suggestions: string[];
}

// =============================================================================
// FUNCIONES DE BÚSQUEDA INTELIGENTE
// =============================================================================

/**
 * Parsea el mensaje del usuario para extraer criterios de búsqueda
 */
function parseSearchCriteria(message: string): {
  daysAgo?: number;
  dateRange?: { start: Date; end: Date };
  fileName?: string;
  emailFrom?: string;
  searchType: 'date' | 'name' | 'sender' | 'content' | 'general';
} {
  const lower = message.toLowerCase();
  
  // Buscar por días atrás (hace X días, X días atrás)
  const daysMatch = lower.match(/hace\s*(\d+)\s*d[ií]as?|(\d+)\s*d[ií]as?\s*atr[aá]s/);
  if (daysMatch) {
    const days = parseInt(daysMatch[1] || daysMatch[2]);
    return { daysAgo: days, searchType: 'date' };
  }
  
  // Ayer
  if (lower.includes('ayer')) {
    return { daysAgo: 1, searchType: 'date' };
  }
  
  // Esta semana
  if (lower.includes('esta semana') || lower.includes('semana pasada') || lower.includes('última semana')) {
    return { daysAgo: 7, searchType: 'date' };
  }
  
  // Este mes
  if (lower.includes('este mes') || lower.includes('mes pasado') || lower.includes('último mes')) {
    return { daysAgo: 30, searchType: 'date' };
  }
  
  // Buscar por nombre de archivo
  const fileMatch = message.match(/archivo\s+["']?([^"']+)["']?|documento\s+["']?([^"']+\.(?:pdf|jpg|png|doc|docx))["']?/i);
  if (fileMatch) {
    return { fileName: fileMatch[1] || fileMatch[2], searchType: 'name' };
  }
  
  // Buscar por remitente
  const senderMatch = lower.match(/de\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+)|enviado\s+por\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+)|remitente\s+([a-zA-Z0-9._%+-]+)/i);
  if (senderMatch) {
    return { emailFrom: senderMatch[1] || senderMatch[2] || senderMatch[3], searchType: 'sender' };
  }
  
  // Buscar contenido específico - extraer nombre del archivo
  // Detectar intención de ver contenido
  const wantsContent = lower.includes('contenido') || 
                       lower.includes('texto extraído') || 
                       lower.includes('qué dice') || 
                       lower.includes('que dice') ||
                       lower.includes('qué contiene') || 
                       lower.includes('mostrame') ||
                       lower.includes('muéstrame') ||
                       lower.includes('mostra') || 
                       lower.includes('muestra');
  
  if (wantsContent) {
    // Primero: buscar cualquier archivo con extensión en el mensaje
    const anyFileMatch = message.match(/([a-zA-Z0-9_\-]+(?:\s+[a-zA-Z0-9_\-]+)*\.(?:pdf|jpg|png|doc|docx|xlsx|xls|txt))/i);
    if (anyFileMatch) {
      return { fileName: anyFileMatch[1].trim(), searchType: 'content' };
    }
    
    // Segundo: buscar nombre sin extensión después de palabras clave
    // Ej: "mostrame que dice factura personal" -> "factura personal"
    const afterKeyword = message.match(/(?:dice|contiene|contenido\s+de|contenido\s+del|mostrame|muéstrame)\s+(?:el\s+|la\s+|del\s+|de\s+)?([a-zA-Z0-9_\-]+(?:[\s\-][a-zA-Z0-9_\-]+)*)/i);
    if (afterKeyword && afterKeyword[1].trim().length > 2) {
      const fileName = afterKeyword[1].trim();
      // Evitar palabras comunes que no son nombres de archivo
      if (!['el', 'la', 'los', 'las', 'un', 'una', 'que', 'del', 'de'].includes(fileName.toLowerCase())) {
        return { fileName: fileName, searchType: 'content' };
      }
    }
    
    return { searchType: 'content' };
  }
  
  return { searchType: 'general' };
}

/**
 * Busca documentos por fecha
 */
async function searchDocumentsByDate(daysAgo: number): Promise<string> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysAgo);
  startDate.setHours(0, 0, 0, 0);
  
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - daysAgo + 1);
  endDate.setHours(23, 59, 59, 999);
  
  // Si es "hace X días" buscamos desde ese día hasta hoy
  const docs = await prisma.extractedDocument.findMany({
    where: {
      extractedAt: {
        gte: startDate,
      },
    },
    orderBy: { extractedAt: "desc" },
    select: {
      id: true,
      fileName: true,
      emailFrom: true,
      emailSubject: true,
      confidence: true,
      extractedAt: true,
      status: true,
    },
  });
  
  if (docs.length === 0) {
    return `No se encontraron documentos de los últimos ${daysAgo} día(s).`;
  }
  
  const docList = docs.map((d, i) => {
    const date = d.extractedAt ? new Date(d.extractedAt).toLocaleDateString('es-ES', { 
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : 'Sin fecha';
    return `${i + 1}. **${d.fileName}**\n   - Fecha: ${date}\n   - De: ${d.emailFrom || 'Desconocido'}\n   - Asunto: ${d.emailSubject || 'Sin asunto'}\n   - Confianza: ${d.confidence?.toFixed(0) || 'N/A'}%`;
  }).join("\n\n");
  
  return `📂 **Documentos de los últimos ${daysAgo} día(s):** (${docs.length} encontrados)\n\n${docList}`;
}

/**
 * Busca documentos por nombre de archivo
 */
async function searchDocumentsByName(fileName: string): Promise<string> {
  const docs = await prisma.extractedDocument.findMany({
    where: {
      fileName: {
        contains: fileName,
        mode: 'insensitive',
      },
    },
    orderBy: { extractedAt: "desc" },
    take: 10,
    select: {
      id: true,
      fileName: true,
      emailFrom: true,
      emailSubject: true,
      confidence: true,
      extractedAt: true,
      rawText: true,
    },
  });
  
  if (docs.length === 0) {
    return `No se encontraron documentos con nombre similar a "${fileName}".`;
  }
  
  const docList = docs.map((d, i) => {
    const date = d.extractedAt ? new Date(d.extractedAt).toLocaleDateString('es-ES') : 'Sin fecha';
    const textPreview = d.rawText ? d.rawText.substring(0, 150).replace(/\n/g, ' ') + '...' : 'Sin texto extraído';
    return `${i + 1}. **${d.fileName}**\n   - Fecha: ${date}\n   - De: ${d.emailFrom || 'Desconocido'}\n   - Preview: ${textPreview}`;
  }).join("\n\n");
  
  return `📂 **Documentos que coinciden con "${fileName}":** (${docs.length} encontrados)\n\n${docList}`;
}

/**
 * Busca documentos por remitente
 */
async function searchDocumentsBySender(emailFrom: string): Promise<string> {
  const docs = await prisma.extractedDocument.findMany({
    where: {
      emailFrom: {
        contains: emailFrom,
        mode: 'insensitive',
      },
    },
    orderBy: { extractedAt: "desc" },
    take: 10,
    select: {
      id: true,
      fileName: true,
      emailFrom: true,
      emailSubject: true,
      confidence: true,
      extractedAt: true,
    },
  });
  
  if (docs.length === 0) {
    return `No se encontraron documentos del remitente "${emailFrom}".`;
  }
  
  const docList = docs.map((d, i) => {
    const date = d.extractedAt ? new Date(d.extractedAt).toLocaleDateString('es-ES') : 'Sin fecha';
    return `${i + 1}. **${d.fileName}**\n   - Fecha: ${date}\n   - Asunto: ${d.emailSubject || 'Sin asunto'}\n   - Confianza: ${d.confidence?.toFixed(0) || 'N/A'}%`;
  }).join("\n\n");
  
  return `📂 **Documentos de "${emailFrom}":** (${docs.length} encontrados)\n\n${docList}`;
}

/**
 * Obtiene el contenido de un documento específico
 */
async function getDocumentContent(fileName: string): Promise<string> {
  const doc = await prisma.extractedDocument.findFirst({
    where: {
      fileName: {
        contains: fileName,
        mode: 'insensitive',
      },
    },
    orderBy: { extractedAt: "desc" },
    select: {
      fileName: true,
      emailFrom: true,
      emailSubject: true,
      extractedAt: true,
      rawText: true,
      structuredData: true,
      tablesData: true,
      confidence: true,
    },
  });
  
  if (!doc) {
    return `No se encontró un documento con nombre similar a "${fileName}".`;
  }
  
  let content = `📄 **Contenido de: ${doc.fileName}**\n\n`;
  content += `- **De:** ${doc.emailFrom || 'Desconocido'}\n`;
  content += `- **Asunto:** ${doc.emailSubject || 'Sin asunto'}\n`;
  content += `- **Confianza:** ${doc.confidence?.toFixed(0) || 'N/A'}%\n\n`;
  
  if (doc.rawText) {
    const truncatedText = doc.rawText.length > 2000 
      ? doc.rawText.substring(0, 2000) + '...\n\n*(Texto truncado, el documento es muy largo)*'
      : doc.rawText;
    content += `**Texto extraído:**\n\`\`\`\n${truncatedText}\n\`\`\`\n\n`;
  }
  
  // Parsear structured data (key-value pairs) si existen
  if (doc.structuredData && typeof doc.structuredData === 'object') {
    const kvPairs = doc.structuredData as any[];
    if (Array.isArray(kvPairs) && kvPairs.length > 0) {
      const kvList = kvPairs.slice(0, 10).map(kv => `- **${kv.key}:** ${kv.value}`).join('\n');
      content += `**Datos clave-valor:**\n${kvList}\n`;
      if (kvPairs.length > 10) {
        content += `\n*(Mostrando 10 de ${kvPairs.length} pares)*\n`;
      }
    }
  }
  
  return content;
}

// =============================================================================
// FUNCIÓN PARA OBTENER CONTEXTO DE LA BD (MEJORADA)
// =============================================================================
async function getContextFromDB(userMessage?: string): Promise<string> {
  try {
    // Parsear la consulta del usuario para búsqueda inteligente
    const criteria = userMessage ? parseSearchCriteria(userMessage) : { searchType: 'general' as const };
    
    // Búsqueda específica según el tipo
    let searchResults = '';
    if (criteria.searchType === 'date' && criteria.daysAgo) {
      searchResults = await searchDocumentsByDate(criteria.daysAgo);
    } else if (criteria.searchType === 'name' && criteria.fileName) {
      searchResults = await searchDocumentsByName(criteria.fileName);
    } else if (criteria.searchType === 'sender' && criteria.emailFrom) {
      searchResults = await searchDocumentsBySender(criteria.emailFrom);
    } else if (criteria.searchType === 'content' && criteria.fileName) {
      searchResults = await getDocumentContent(criteria.fileName);
    }
    
    // Estadísticas generales
    const [total, completed, errors, avgConf, recentDocs] = await Promise.all([
      prisma.extractedDocument.count(),
      prisma.extractedDocument.count({ where: { status: "completed" } }),
      prisma.extractedDocument.count({ where: { status: "error" } }),
      prisma.extractedDocument.aggregate({ _avg: { confidence: true } }),
      prisma.extractedDocument.findMany({
        take: 5,
        orderBy: { extractedAt: "desc" },
        select: { fileName: true, emailFrom: true, confidence: true, extractedAt: true, status: true },
      }),
    ]);

    const docList = recentDocs.map((d, i) => {
      const date = d.extractedAt ? new Date(d.extractedAt).toLocaleDateString('es-ES') : '';
      return `${i + 1}. ${d.fileName} (${d.confidence?.toFixed(0)}% confianza, ${date}, de: ${d.emailFrom})`;
    }).join("\n");

    let context = `
CONTEXTO DEL SISTEMA:
- Total documentos procesados: ${total}
- Completados exitosamente: ${completed}
- Con errores: ${errors}
- Confianza promedio de extracción: ${avgConf._avg.confidence?.toFixed(1) || 'N/A'}%

ÚLTIMOS 5 DOCUMENTOS:
${docList || "No hay documentos procesados aún."}
`;

    if (searchResults) {
      context += `\nRESULTADOS DE BÚSQUEDA:\n${searchResults}\n`;
    }

    context += `
SERVICIOS DISPONIBLES:
- Gmail API: Conectado (lee emails con adjuntos)
- AWS Textract: Activo (extrae texto, tablas y datos)
- AWS S3: Activo (almacena documentos)
- PostgreSQL: Conectado (guarda resultados)

CAPACIDADES DE BÚSQUEDA:
- Puedo buscar documentos por fecha (ej: "hace 3 días", "esta semana", "ayer")
- Puedo buscar por nombre de archivo (ej: "archivo factura.pdf")
- Puedo buscar por remitente (ej: "documentos de empresa@mail.com")
- Puedo mostrar el contenido extraído de un documento específico
`;
    return context;
  } catch (error) {
    console.error("Error getting context from DB:", error);
    return "No se pudo obtener el contexto de la base de datos.";
  }
}

// =============================================================================
// FUNCIÓN PARA OBTENER RESPUESTA DE GEMINI
// =============================================================================
async function getGeminiResponse(userMessage: string): Promise<ChatResponse> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  // Obtener contexto con búsqueda inteligente basada en el mensaje del usuario
  const context = await getContextFromDB(userMessage);
  
  const systemPrompt = `Eres el asistente del "Email Document Extractor", una aplicación que:
1. Lee emails con adjuntos de Gmail
2. Extrae datos de documentos usando AWS Textract
3. Guarda los resultados en PostgreSQL

Responde en español, de forma clara y concisa. Usa markdown para formatear.
Cuando menciones datos, usa la información del contexto proporcionado.
Si hay RESULTADOS DE BÚSQUEDA en el contexto, úsalos para responder.

${context}

INSTRUCCIONES:
- Si preguntan por estadísticas, usa los datos del contexto
- Si preguntan por documentos de una fecha específica, usa los RESULTADOS DE BÚSQUEDA
- Si preguntan por un documento específico, menciona los detalles encontrados
- Si preguntan cómo procesar emails, explica que deben ir al Dashboard
- Si preguntan qué contiene un documento, muestra el texto extraído
- Siempre sé amable y útil
- Respuestas informativas y bien formateadas con markdown`;

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const result = await model.generateContent([
    { text: systemPrompt },
    { text: `Usuario: ${userMessage}` }
  ]);

  const response = result.response.text();

  // Generar sugerencias basadas en el contexto
  const suggestions = generateSuggestions(userMessage);

  return {
    message: response,
    suggestions
  };
}

// =============================================================================
// GENERAR SUGERENCIAS CONTEXTUALES
// =============================================================================
function generateSuggestions(lastMessage: string): string[] {
  const lower = lastMessage.toLowerCase();
  
  if (lower.includes("estadistica") || lower.includes("cuantos")) {
    return ["Documentos de ayer", "Documentos de esta semana", "Estado del sistema"];
  }
  if (lower.includes("hace") || lower.includes("días") || lower.includes("ayer") || lower.includes("semana")) {
    return ["Ver estadísticas", "Documentos de hoy", "Buscar por remitente"];
  }
  if (lower.includes("documento") || lower.includes("reciente")) {
    return ["Documentos de hace 3 días", "Buscar por nombre", "Ver estadísticas"];
  }
  if (lower.includes("email") || lower.includes("procesar")) {
    return ["Ver estadísticas", "Documentos recientes", "Documentos de ayer"];
  }
  if (lower.includes("hola") || lower.includes("ayuda")) {
    return ["Ver estadísticas", "Documentos de esta semana", "Buscar documentos", "Estado del sistema"];
  }
  if (lower.includes("contenido") || lower.includes("texto")) {
    return ["Ver estadísticas", "Documentos recientes", "Buscar por fecha"];
  }
  
  return ["Ver estadísticas", "Documentos de ayer", "Documentos de esta semana", "Ayuda"];
}

// =============================================================================
// RESPUESTAS LOCALES (FALLBACK SIN GEMINI)
// =============================================================================
async function getSmartResponse(message: string): Promise<ChatResponse> {
  const lowerMessage = message.toLowerCase();
  
  // Parsear criterios de búsqueda
  const criteria = parseSearchCriteria(message);
  
  // Búsqueda por fecha
  if (criteria.searchType === 'date' && criteria.daysAgo) {
    try {
      const result = await searchDocumentsByDate(criteria.daysAgo);
      return {
        message: result,
        suggestions: ["Ver estadísticas", "Documentos de hoy", "Buscar por remitente"]
      };
    } catch {
      return {
        message: "No pude buscar los documentos por fecha. Verifica la conexión a la base de datos.",
        suggestions: ["Reintentar", "Ver estadísticas", "Ayuda"]
      };
    }
  }
  
  // Búsqueda por nombre
  if (criteria.searchType === 'name' && criteria.fileName) {
    try {
      const result = await searchDocumentsByName(criteria.fileName);
      return {
        message: result,
        suggestions: ["Ver contenido del documento", "Ver estadísticas", "Buscar otro"]
      };
    } catch {
      return {
        message: "No pude buscar el documento. Verifica la conexión a la base de datos.",
        suggestions: ["Reintentar", "Ver estadísticas", "Ayuda"]
      };
    }
  }
  
  // Búsqueda por remitente
  if (criteria.searchType === 'sender' && criteria.emailFrom) {
    try {
      const result = await searchDocumentsBySender(criteria.emailFrom);
      return {
        message: result,
        suggestions: ["Ver estadísticas", "Buscar por fecha", "Documentos recientes"]
      };
    } catch {
      return {
        message: "No pude buscar documentos del remitente. Verifica la conexión a la base de datos.",
        suggestions: ["Reintentar", "Ver estadísticas", "Ayuda"]
      };
    }
  }
  
  // Comandos de estadísticas
  if (lowerMessage.includes("estadistica") || lowerMessage.includes("estadísticas") || lowerMessage.includes("stats") || lowerMessage.includes("cuantos")) {
    try {
      const [total, completed, errors, avgConf] = await Promise.all([
        prisma.extractedDocument.count(),
        prisma.extractedDocument.count({ where: { status: "completed" } }),
        prisma.extractedDocument.count({ where: { status: "error" } }),
        prisma.extractedDocument.aggregate({ _avg: { confidence: true } }),
      ]);
      
      return {
        message: `📊 **Estadísticas del Sistema**

- **Total documentos:** ${total}
- **Completados:** ${completed} ✅
- **Con errores:** ${errors} ❌
- **Confianza promedio:** ${avgConf._avg.confidence?.toFixed(1) || 'N/A'}%

Los documentos se procesan usando AWS Textract para extraer texto, tablas y datos clave-valor.`,
        suggestions: ["Ver documentos recientes", "Estado del sistema", "Cómo procesar emails"]
      };
    } catch {
      return {
        message: "No pude obtener las estadísticas. Verifica la conexión a la base de datos.",
        suggestions: ["Reintentar estadísticas", "Estado del sistema", "Ayuda"]
      };
    }
  }
  
  // Documentos recientes
  if (lowerMessage.includes("documento") || lowerMessage.includes("reciente") || lowerMessage.includes("ultimo")) {
    try {
      const docs = await prisma.extractedDocument.findMany({
        take: 5,
        orderBy: { extractedAt: "desc" },
        select: { fileName: true, emailFrom: true, confidence: true, extractedAt: true },
      });
      
      if (docs.length === 0) {
        return {
          message: "📂 No hay documentos procesados aún. Usa el botón **Procesar Emails** en el Dashboard para comenzar.",
          suggestions: ["Cómo procesar emails", "Estado del sistema", "Ayuda"]
        };
      }
      
      const docList = docs.map((d, i) => 
        `${i + 1}. **${d.fileName}** - ${d.confidence?.toFixed(0)}% confianza`
      ).join("\n");
      
      return {
        message: `📂 **Últimos ${docs.length} documentos procesados:**

${docList}

Puedes ver más detalles en la sección **Documentos**.`,
        suggestions: ["Ver estadísticas", "Cómo procesar emails", "Estado del sistema"]
      };
    } catch {
      return {
        message: "No pude obtener los documentos. Verifica la conexión a la base de datos.",
        suggestions: ["Reintentar documentos", "Estado del sistema", "Ayuda"]
      };
    }
  }
  
  // Ayuda
  if (lowerMessage.includes("ayuda") || lowerMessage.includes("help") || lowerMessage.includes("que puedes")) {
    return {
      message: `🤖 **¿Cómo puedo ayudarte?**

Puedo responder sobre:

📊 **Estadísticas** - "¿cuántos documentos hay?" o "estadísticas"
📂 **Documentos recientes** - "documentos recientes" o "últimos documentos"

🔍 **Búsquedas avanzadas:**
- **Por fecha:** "documentos de hace 3 días", "documentos de ayer", "esta semana"
- **Por nombre:** "buscar archivo factura.pdf"
- **Por remitente:** "documentos de empresa@mail.com"
- **Ver contenido:** "qué contiene el documento X"

🔧 **Sistema** - "estado del sistema" o "servicios"
📧 **Emails** - "revisar emails" o "emails pendientes"

También puedes hacerme preguntas abiertas y responderé con la información disponible.`,
      suggestions: ["Documentos de ayer", "Documentos de esta semana", "Ver estadísticas", "Estado del sistema"]
    };
  }
  
  // Estado del sistema
  if (lowerMessage.includes("estado") || lowerMessage.includes("sistema") || lowerMessage.includes("servicio")) {
    const geminiStatus = geminiAvailable ? "✅ Activo" : "⚠️ Cuota limitada";
    return {
      message: `🔧 **Estado del Sistema**

- **Gmail API:** ✅ Conectado
- **AWS Textract:** ✅ Activo
- **AWS S3:** ✅ Activo
- **PostgreSQL:** ✅ Conectado
- **Gemini AI:** ${geminiStatus}

El procesamiento de documentos funciona correctamente.`,
      suggestions: ["Ver estadísticas", "Documentos recientes", "Revisar emails"]
    };
  }
  
  // Saludo
  if (lowerMessage.includes("hola") || lowerMessage.includes("hello") || lowerMessage.includes("buenas")) {
    return {
      message: `👋 **¡Hola!** Soy el asistente del Email Document Extractor.

Puedo ayudarte con:
- 📊 Ver estadísticas del sistema
- 📂 Consultar documentos procesados
- 🔧 Verificar estado de servicios
- 📧 Revisar emails pendientes

¿En qué puedo ayudarte?`,
      suggestions: ["Ver estadísticas", "Documentos recientes", "Estado del sistema", "Revisar emails"]
    };
  }
  
  // Revisar emails
  if (lowerMessage.includes("revisar email") || lowerMessage.includes("email pendiente") || lowerMessage.includes("bandeja")) {
    try {
      const backendResponse = await fetch(`${BACKEND_URL}/api/emails`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (backendResponse.ok) {
        const data = await backendResponse.json();
        const emails = data.emails || [];
        
        if (emails.length === 0) {
          return {
            message: `📧 **Bandeja de entrada revisada**

No hay emails con adjuntos pendientes de procesar. ¡Todo al día! ✨`,
            suggestions: ["Ver estadísticas", "Documentos recientes", "Estado del sistema"]
          };
        }
        
        const emailList = emails.slice(0, 3).map((e: any, i: number) => 
          `${i + 1}. **${e.subject || 'Sin asunto'}**\n   - De: ${e.from}\n   - Adjuntos: ${e.attachments?.length || 0}`
        ).join("\n\n");
        
        return {
          message: `📧 **Emails con adjuntos pendientes:** (${data.count})

${emailList}

${emails.length > 3 ? `\n...y ${emails.length - 3} más.` : ''}

Para procesarlos, ve al **Dashboard** y haz click en **Procesar Emails**.`,
          suggestions: ["Ir al Dashboard", "Ver estadísticas", "Documentos recientes"]
        };
      }
    } catch (error) {
      console.log('Could not fetch emails from backend:', error);
    }
    
    return {
      message: `📧 **Revisar Emails**

Para revisar emails pendientes, asegúrate de que el **backend** esté corriendo:

\`\`\`
npm run server
\`\`\`

Luego puedes:
1. Usar el botón **Procesar Emails** en el Dashboard
2. O volver a preguntar aquí`,
      suggestions: ["Estado del sistema", "Ver estadísticas", "Ayuda"]
    };
  }
  
  // Procesar
  if (lowerMessage.includes("procesar") || lowerMessage.includes("extraer")) {
    return {
      message: `📧 **Procesamiento de Emails**

Para procesar emails con adjuntos:

1. Ve al **Dashboard**
2. Click en **Procesar Emails**
3. El sistema:
   - Lee emails no leídos con adjuntos
   - Sube los archivos a AWS S3
   - Extrae datos con AWS Textract
   - Guarda los resultados en PostgreSQL

Los documentos procesados aparecerán en la sección **Documentos**.`,
      suggestions: ["Revisar emails pendientes", "Ver estadísticas", "Documentos recientes"]
    };
  }
  
  // Respuesta por defecto
  return {
    message: `Recibí tu mensaje: *"${message}"*

No estoy seguro de cómo responder a eso, pero puedo ayudarte con:

- 📊 Estadísticas del sistema
- 📂 Documentos procesados
- 🔧 Estado de servicios
- 📧 Revisar emails pendientes

Selecciona una opción o escribe tu pregunta.`,
    suggestions: ["Ver estadísticas", "Documentos recientes", "Estado del sistema", "Ayuda"]
  };
}

// =============================================================================
// HANDLER PRINCIPAL
// =============================================================================
export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { message } = await request.json();

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // Determinar si debemos intentar Gemini
    const shouldTryGemini = USE_GEMINI && GEMINI_API_KEY && (
      geminiAvailable || 
      (lastGeminiError && Date.now() - lastGeminiError.getTime() > GEMINI_RETRY_DELAY_MS)
    );

    if (shouldTryGemini) {
      try {
        console.log("[Chat] Intentando respuesta con Gemini...");
        const geminiResponse = await getGeminiResponse(message);
        
        // Gemini funcionó, resetear estado
        geminiAvailable = true;
        lastGeminiError = null;
        
        console.log("[Chat] Respuesta de Gemini exitosa");
        return NextResponse.json({
          message: geminiResponse.message,
          suggestions: geminiResponse.suggestions,
          timestamp: new Date().toISOString(),
          fromGemini: true,
          geminiStatus: "available",
        });
      } catch (error: any) {
        console.error("[Chat] Error de Gemini:", error.message);
        
        // Detectar error 429 (quota exceeded)
        if (error.message?.includes("429") || error.message?.includes("quota") || error.message?.includes("RESOURCE_EXHAUSTED")) {
          console.log("[Chat] Gemini quota exceeded, switching to fallback");
          geminiAvailable = false;
          lastGeminiError = new Date();
        }
        
        // Continuar con fallback
      }
    }

    // Fallback: Respuesta local sin Gemini
    console.log("[Chat] Usando respuesta local (fallback)");
    const response = await getSmartResponse(message);
    
    return NextResponse.json({
      message: response.message,
      suggestions: response.suggestions,
      timestamp: new Date().toISOString(),
      fromGemini: false,
      geminiStatus: geminiAvailable ? "available" : "quota_exceeded",
    });
  } catch (error) {
    console.error("Error processing chat:", error);
    return NextResponse.json(
      { error: "Failed to process message" },
      { status: 500 }
    );
  }
}
