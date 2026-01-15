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
// FUNCIÓN PARA OBTENER CONTEXTO DE LA BD
// =============================================================================
async function getContextFromDB(): Promise<string> {
  try {
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

    const docList = recentDocs.map((d, i) => 
      `${i + 1}. ${d.fileName} (${d.confidence?.toFixed(0)}% confianza, de: ${d.emailFrom})`
    ).join("\n");

    return `
CONTEXTO DEL SISTEMA:
- Total documentos procesados: ${total}
- Completados exitosamente: ${completed}
- Con errores: ${errors}
- Confianza promedio de extracción: ${avgConf._avg.confidence?.toFixed(1) || 'N/A'}%

ÚLTIMOS 5 DOCUMENTOS:
${docList || "No hay documentos procesados aún."}

SERVICIOS DISPONIBLES:
- Gmail API: Conectado (lee emails con adjuntos)
- AWS Textract: Activo (extrae texto, tablas y datos)
- AWS S3: Activo (almacena documentos)
- PostgreSQL: Conectado (guarda resultados)
`;
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

  const context = await getContextFromDB();
  
  const systemPrompt = `Eres el asistente del "Email Document Extractor", una aplicación que:
1. Lee emails con adjuntos de Gmail
2. Extrae datos de documentos usando AWS Textract
3. Guarda los resultados en PostgreSQL

Responde en español, de forma clara y concisa. Usa markdown para formatear.
Cuando menciones datos, usa la información del contexto proporcionado.

${context}

INSTRUCCIONES:
- Si preguntan por estadísticas, usa los datos del contexto
- Si preguntan por documentos, menciona los más recientes
- Si preguntan cómo procesar emails, explica que deben ir al Dashboard
- Siempre sé amable y útil
- Respuestas cortas pero informativas`;

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
    return ["Ver documentos recientes", "Estado del sistema", "Cómo procesar emails"];
  }
  if (lower.includes("documento") || lower.includes("reciente")) {
    return ["Ver estadísticas", "Revisar emails pendientes", "Estado del sistema"];
  }
  if (lower.includes("email") || lower.includes("procesar")) {
    return ["Ver estadísticas", "Documentos recientes", "Estado del sistema"];
  }
  if (lower.includes("hola") || lower.includes("ayuda")) {
    return ["Ver estadísticas", "Documentos recientes", "Revisar emails", "Estado del sistema"];
  }
  
  return ["Ver estadísticas", "Documentos recientes", "Estado del sistema", "Ayuda"];
}

// =============================================================================
// RESPUESTAS LOCALES (FALLBACK SIN GEMINI)
// =============================================================================
async function getSmartResponse(message: string): Promise<ChatResponse> {
  const lowerMessage = message.toLowerCase();
  
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

Actualmente puedo responder sobre:

📊 **Estadísticas** - Pregunta "¿cuántos documentos hay?" o "estadísticas"
📂 **Documentos** - Pregunta "documentos recientes" o "últimos documentos"
🔧 **Sistema** - Pregunta "estado del sistema" o "servicios"
📧 **Emails** - Pregunta "revisar emails" o "emails pendientes"

También puedes hacerme preguntas abiertas y responderé con la información disponible.`,
      suggestions: ["Ver estadísticas", "Documentos recientes", "Estado del sistema", "Revisar emails"]
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
