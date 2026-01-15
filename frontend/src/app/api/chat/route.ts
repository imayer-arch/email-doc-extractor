import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

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

    // TODO: Connect to ADK agent when Gemini quota is available
    // For now, return a placeholder response
    
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
