import { z } from "zod";
import { authenticateApi, getIntegrationUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { assignTicket, changeStatus, serializeTicket, ticketInclude } from "@/lib/tickets";

// GET   /api/v1/tickets/:id — detalhe
// PATCH /api/v1/tickets/:id — muda status e/ou responsável
//
// A alteração passa pelo serviço de tickets, e não por um update direto, para
// que o histórico e as métricas sejam gravados igual a uma ação feita na tela.

export const dynamic = "force-dynamic";

async function loadId(params: Promise<{ id: string }>): Promise<number | null> {
  const { id } = await params;
  const parsed = Number(id);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApi(request, "tickets:read");
  if (!auth.ok) return auth.response;

  const id = await loadId(params);
  if (id === null) return Response.json({ error: "Id inválido." }, { status: 400 });

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: ticketInclude,
  });
  if (!ticket) return Response.json({ error: "Chamado não encontrado." }, { status: 404 });

  // Notas internas nunca saem pela API: o n8n costuma encaminhar o conteúdo
  // para fora (e-mail, WhatsApp), e nota interna não é para o solicitante.
  const comments = await prisma.comment.findMany({
    where: { ticketId: id, internal: false },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, name: true } } },
  });

  return Response.json({
    data: {
      ...serializeTicket(ticket),
      comments: comments.map((c) => ({
        id: c.id,
        body: c.body,
        createdAt: c.createdAt.toISOString(),
        author: c.author ? { id: c.author.id, name: c.author.name } : null,
      })),
    },
  });
}

const patchSchema = z
  .object({
    status: z
      .enum([
        "OPEN",
        "TRIAGED",
        "IN_PROGRESS",
        "WAITING_REQUESTER",
        "WAITING_THIRD_PARTY",
        "IN_REVIEW",
        "RESOLVED",
        "CLOSED",
        "CANCELLED",
      ])
      .optional(),
    // null remove o responsável; ausente não mexe no campo.
    assigneeId: z.number().int().positive().nullable().optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine(
    (v) => v.status !== undefined || v.assigneeId !== undefined,
    "Informe ao menos status ou assigneeId.",
  );

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApi(request, "tickets:write");
  if (!auth.ok) return auth.response;

  const id = await loadId(params);
  if (id === null) return Response.json({ error: "Id inválido." }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Corpo da requisição não é um JSON válido." }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Dados inválidos.",
        details: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 422 },
    );
  }

  const exists = await prisma.ticket.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return Response.json({ error: "Chamado não encontrado." }, { status: 404 });

  const actorId = await getIntegrationUser();

  if (parsed.data.assigneeId !== undefined) {
    await assignTicket(id, parsed.data.assigneeId, actorId);
  }
  if (parsed.data.status) {
    await changeStatus(id, parsed.data.status, actorId, parsed.data.note);
  }

  const updated = await prisma.ticket.findUniqueOrThrow({
    where: { id },
    include: ticketInclude,
  });

  return Response.json({ data: serializeTicket(updated) });
}
