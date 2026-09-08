import { z } from "zod";
import { authenticateApi, getIntegrationUser } from "@/lib/api-auth";
import { activeStatuses } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { createTicket, serializeTicket, ticketInclude } from "@/lib/tickets";

// GET  /api/v1/tickets — lista chamados
// POST /api/v1/tickets — abre um chamado
//
// É por aqui que o n8n cria chamados a partir de e-mail, WhatsApp ou formulário
// externo, e consulta a fila para montar relatórios.

export const dynamic = "force-dynamic";

const MAX_LIMIT = 100;

export async function GET(request: Request) {
  const auth = await authenticateApi(request, "tickets:read");
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 25, MAX_LIMIT);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

  const status = url.searchParams.get("status");
  const teamId = Number(url.searchParams.get("teamId")) || undefined;
  const type = url.searchParams.get("type");
  const since = url.searchParams.get("since");

  const where = {
    ...(status === "open"
      ? { status: { in: activeStatuses } }
      : status
        ? { status: status as never }
        : {}),
    ...(teamId ? { teamId } : {}),
    ...(type ? { type: type as never } : {}),
    // `since` filtra por última alteração, não por criação: é o que o n8n
    // precisa para sincronizar só o que mudou desde a última execução.
    ...(since && !Number.isNaN(Date.parse(since))
      ? { updatedAt: { gte: new Date(since) } }
      : {}),
  };

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: ticketInclude,
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.ticket.count({ where }),
  ]);

  return Response.json({
    data: tickets.map(serializeTicket),
    pagination: { total, limit, offset, hasMore: offset + tickets.length < total },
  });
}

const createSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(1),
  type: z
    .enum(["SUPPORT", "INCIDENT", "CHANGE_REQUEST", "IMPROVEMENT", "TASK"])
    .default("SUPPORT"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  teamId: z.number().int().positive().optional(),
  categoryId: z.number().int().positive().optional(),
  projectId: z.number().int().positive().optional(),
  assigneeId: z.number().int().positive().optional(),
  /** E-mail de quem pediu. Se não existir no sistema, o chamado fica no usuário de integração. */
  requesterEmail: z.string().email().optional(),
  /** Chave idempotente: reenviar o mesmo valor devolve o chamado já criado. */
  externalRef: z.string().trim().max(200).optional(),
});

export async function POST(request: Request) {
  const auth = await authenticateApi(request, "tickets:write");
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Corpo da requisição não é um JSON válido." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
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

  const input = parsed.data;

  // Idempotência: uma reexecução do fluxo no n8n (ou uma retentativa depois de
  // timeout) não pode virar chamado duplicado.
  if (input.externalRef) {
    const existing = await prisma.ticket.findUnique({
      where: { externalRef: input.externalRef },
      include: ticketInclude,
    });
    if (existing) {
      return Response.json(
        { data: serializeTicket(existing), deduplicated: true },
        { status: 200 },
      );
    }
  }

  let requesterId: number;
  if (input.requesterEmail) {
    const user = await prisma.user.findUnique({
      where: { email: input.requesterEmail.toLowerCase() },
      select: { id: true },
    });
    requesterId = user?.id ?? (await getIntegrationUser());
  } else {
    requesterId = await getIntegrationUser();
  }

  try {
    const ticket = await createTicket({
      title: input.title,
      description: input.description,
      type: input.type,
      priority: input.priority,
      teamId: input.teamId ?? null,
      categoryId: input.categoryId ?? null,
      projectId: input.projectId ?? null,
      assigneeId: input.assigneeId ?? null,
      requesterId,
      source: "N8N",
      externalRef: input.externalRef ?? null,
    });

    return Response.json({ data: serializeTicket(ticket) }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível criar o chamado.",
      },
      { status: 400 },
    );
  }
}
