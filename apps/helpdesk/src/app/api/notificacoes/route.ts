import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

// Notificações do sino.
//
// GET  — as mais recentes e quantas não lidas.
// POST — marca como lidas (todas, ou uma específica pelo id).

export const dynamic = "force-dynamic";

const LIMITE = 12;

export async function GET() {
  const user = await getSessionUser();
  if (!user) return new Response("Não autenticado.", { status: 401 });

  const [itens, naoLidas] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: LIMITE,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        readAt: true,
        createdAt: true,
        ticketId: true,
      },
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);

  return Response.json({
    naoLidas,
    itens: itens.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      lida: n.readAt !== null,
      createdAt: n.createdAt.toISOString(),
      ticketId: n.ticketId,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("Não autenticado.", { status: 401 });

  let corpo: { id?: number } = {};
  try {
    corpo = await request.json();
  } catch {
    // Sem corpo significa "marcar todas".
  }

  await prisma.notification.updateMany({
    // O filtro por userId não é redundante: sem ele, um id de outra pessoa
    // marcaria a notificação dela como lida.
    where: {
      userId: user.id,
      readAt: null,
      ...(corpo.id ? { id: corpo.id } : {}),
    },
    data: { readAt: new Date() },
  });

  return Response.json({ ok: true });
}
