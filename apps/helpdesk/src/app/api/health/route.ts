import { prisma } from "@/lib/prisma";

// Consultado pelo HEALTHCHECK do container e pelo monitoramento externo.
// Precisa ser dinâmica: sem isso o Next tentaria pré-renderizar durante o
// build, quando o banco ainda não existe.
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({
      status: "ok",
      database: "up",
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    // 503 para o Docker marcar o container como unhealthy e o proxy tirá-lo
    // da rotação, em vez de servir erro 500 para o usuário.
    return Response.json(
      {
        status: "degraded",
        database: "down",
        error: error instanceof Error ? error.message : "erro desconhecido",
      },
      { status: 503 },
    );
  }
}
