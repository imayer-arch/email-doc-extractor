import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [total, completed, errors, avgConfidenceResult] = await Promise.all([
      prisma.extractedDocument.count(),
      prisma.extractedDocument.count({ where: { status: "completed" } }),
      prisma.extractedDocument.count({ where: { status: "error" } }),
      prisma.extractedDocument.aggregate({
        _avg: { confidence: true },
        where: { status: "completed" },
      }),
    ]);

    const stats = {
      total,
      completed,
      errors,
      avgConfidence: avgConfidenceResult._avg.confidence || 0,
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error("Error fetching stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
