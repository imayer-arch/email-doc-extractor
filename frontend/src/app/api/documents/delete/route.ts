import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const BACKEND_URL = process.env.BACKEND_API_URL || "http://localhost:3000";

export async function POST(request: Request) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { ids } = await request.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "No document IDs provided" },
        { status: 400 }
      );
    }

    const response = await fetch(`${BACKEND_URL}/api/documents/delete-batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Backend error: ${response.status}`);
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      message: data.message,
      deletedCount: data.deletedCount,
    });
  } catch (error) {
    console.error("Error deleting documents:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

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
        error: "Failed to delete documents",
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
