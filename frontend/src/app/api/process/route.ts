import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const BACKEND_URL = process.env.BACKEND_API_URL || "http://localhost:3000";

export async function POST() {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("Calling backend at:", BACKEND_URL);
    
    // Call the backend API
    const response = await fetch(`${BACKEND_URL}/api/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Backend error: ${response.status}`);
    }

    const data = await response.json();
    
    return NextResponse.json({
      success: true,
      message: data.message || "Procesamiento completado",
      details: {
        emailsProcessed: data.emailsProcessed || 0,
        documentsProcessed: data.documentsProcessed || 0,
        successful: data.successful || 0,
        failed: data.failed || 0,
      },
    });
  } catch (error) {
    console.error("Error triggering process:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    // Check if backend is not running
    if (errorMessage.includes("ECONNREFUSED") || errorMessage.includes("fetch failed")) {
      return NextResponse.json(
        { 
          error: "Backend no disponible",
          details: "Asegúrate de que el backend esté corriendo con: npm run server",
        },
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      { 
        error: "Failed to trigger processing",
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
