import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * =============================================================================
 * TODO: CONECTAR CON GOOGLE ADK CUANDO HAYA CUOTA DE GEMINI
 * =============================================================================
 * 
 * PASOS PARA ACTIVAR EL AGENTE ADK:
 * 
 * 1. Asegurarse de tener cuota disponible en Gemini API
 *    - Verificar en: https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com
 *    - O obtener API key de pago
 * 
 * 2. Agregar endpoint en el backend (src/server.ts):
 *    ```typescript
 *    import { runAgent } from './agent';
 *    
 *    app.post('/api/chat', async (req, res) => {
 *      const { message } = req.body;
 *      const response = await runAgent(message);
 *      res.json({ message: response });
 *    });
 *    ```
 * 
 * 3. Cambiar esta API route para llamar al backend:
 *    ```typescript
 *    const backendResponse = await fetch(`${BACKEND_URL}/api/chat`, {
 *      method: 'POST',
 *      headers: { 'Content-Type': 'application/json' },
 *      body: JSON.stringify({ message }),
 *    });
 *    const data = await backendResponse.json();
 *    return NextResponse.json(data);
 *    ```
 * 
 * 4. El agente ADK (src/agent/index.ts) ya tiene estas tools configuradas:
 *    - checkEmails: Revisar emails con adjuntos
 *    - getEmailAttachment: Obtener adjunto específico
 *    - extractDocumentData: Extraer datos con Textract
 *    - saveExtractedData: Guardar en PostgreSQL
 *    - getExtractionStats: Obtener estadísticas
 *    - sendExtractionNotification: Enviar notificaciones
 * 
 * =============================================================================
 */

const BACKEND_URL = process.env.BACKEND_API_URL || "http://localhost:3000";

// TODO: Cambiar USE_ADK a true cuando haya cuota de Gemini
const USE_ADK = false;

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

    // TODO: Cuando USE_ADK = true, descomentar este bloque:
    /*
    if (USE_ADK) {
      try {
        const backendResponse = await fetch(`${BACKEND_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        });
        
        if (!backendResponse.ok) {
          throw new Error('Backend error');
        }
        
        const data = await backendResponse.json();
        return NextResponse.json({
          message: data.message || data.response,
          timestamp: new Date().toISOString(),
          fromADK: true,
        });
      } catch (error) {
        console.error('ADK error, falling back to mock:', error);
        // Fall through to mock response
      }
    }
    */

    // Respuesta mock mientras no hay cuota de Gemini
    const response = {
      message: `Recibí tu mensaje: "${message}". 

El agente ADK está configurado pero actualmente tiene cuota limitada de Gemini. 

**Servicios activos:**
- ✅ Gmail API: Conectado
- ✅ AWS Textract: Activo  
- ✅ PostgreSQL: Conectado
- ⚠️ Google ADK: Cuota limitada

Cuando la cuota se restablezca, podré ejecutar las siguientes acciones:
- Revisar emails con adjuntos
- Extraer datos de documentos
- Guardar información en la base de datos
- Enviar notificaciones`,
      timestamp: new Date().toISOString(),
      fromADK: false,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error processing chat:", error);
    return NextResponse.json(
      { error: "Failed to process message" },
      { status: 500 }
    );
  }
}
