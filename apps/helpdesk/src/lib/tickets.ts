import type { Prisma } from "@/generated/prisma/client";
import type {
  Priority,
  Role,
  TicketSource,
  TicketStatus,
  TicketType,
} from "@/generated/prisma/enums";
import { prisma } from "./prisma";
import {
  computeDeadlines,
  elapsedMinutes,
  extendDeadlineForPause,
  isTerminal,
  isWaiting,
  selectPolicy,
} from "./sla";
import { emitWebhook } from "./webhooks";

// Ponto único de escrita dos tickets.
//
// Toda mudança passa por aqui porque três coisas precisam acontecer juntas ou
// não acontecer: a alteração em si, o evento de auditoria e o fechamento do
// período de status. É esse conjunto que permite responder depois "quanto
// tempo levamos para entregar" sem depender de ninguém preencher campo.

type Tx = Prisma.TransactionClient;

/**
 * Relações carregadas sempre que um ticket vai virar payload — de webhook ou
 * de /api/v1. Centralizado para o formato externo nunca depender de qual
 * função carregou o registro.
 */
export const ticketInclude = {
  team: true,
  category: true,
  requester: true,
  assignee: true,
  project: true,
} satisfies Prisma.TicketInclude;

/** Só a resposta pública do administrador conta como primeira resposta. */
const RESPONDER_ROLES: Role[] = ["ADMIN"];

async function loadPolicyFor(
  tx: Tx,
  match: { teamId: number; type: TicketType; priority: Priority },
) {
  const policies = await tx.slaPolicy.findMany({
    where: { active: true },
    orderBy: { id: "asc" },
  });
  return selectPolicy(policies, match);
}

/** Fecha o período de status aberto e devolve quanto ele durou. */
async function closeOpenPeriod(
  tx: Tx,
  ticketId: number,
  at: Date,
  policy: Awaited<ReturnType<typeof loadPolicyFor>>,
): Promise<{ status: TicketStatus; businessMinutes: number } | null> {
  const open = await tx.ticketStatusPeriod.findFirst({
    where: { ticketId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (!open) return null;

  const minutes = Math.max(
    0,
    Math.round((at.getTime() - open.startedAt.getTime()) / 60_000),
  );
  const businessMinutes = elapsedMinutes(open.startedAt, at, policy);

  await tx.ticketStatusPeriod.update({
    where: { id: open.id },
    data: { endedAt: at, minutes, businessMinutes },
  });

  return { status: open.status, businessMinutes };
}

/**
 * Tempo efetivo de trabalho: soma dos períodos que não são de espera nem
 * finais. É o número que responde "quanto tempo o time realmente segurou isso".
 */
async function recomputeWorkingMinutes(tx: Tx, ticketId: number): Promise<number> {
  const periods = await tx.ticketStatusPeriod.findMany({
    where: { ticketId, endedAt: { not: null } },
    select: { status: true, businessMinutes: true },
  });

  return periods
    .filter((p) => !isWaiting(p.status) && !isTerminal(p.status))
    .reduce((sum, p) => sum + (p.businessMinutes ?? 0), 0);
}

// ===================== CRIAÇÃO =====================

export interface CreateTicketInput {
  title: string;
  description: string;
  requesterId: number;
  type?: TicketType;
  priority?: Priority;
  categoryId?: number | null;
  teamId?: number | null;
  projectId?: number | null;
  assigneeId?: number | null;
  dueAt?: Date | null;
  estimateMinutes?: number | null;
  source?: TicketSource;
  /** Chave idempotente da origem externa (id de e-mail, execução do n8n). */
  externalRef?: string | null;
  tagIds?: number[];
}

export async function createTicket(input: CreateTicketInput) {
  const type = input.type ?? "SUPPORT";
  const priority = input.priority ?? "MEDIUM";

  const ticket = await prisma.$transaction(async (tx) => {
    // O setor vem do pedido ou, na falta dele, da categoria escolhida — que é
    // como o chamado aberto por e-mail/n8n chega ao time certo sem que a
    // origem precise conhecer a estrutura interna.
    let teamId = input.teamId ?? null;
    if (!teamId && input.categoryId) {
      const category = await tx.category.findUnique({
        where: { id: input.categoryId },
        select: { teamId: true },
      });
      teamId = category?.teamId ?? null;
    }
    if (!teamId) {
      throw new Error("Informe o setor responsável ou uma categoria que tenha setor.");
    }

    const policy = await loadPolicyFor(tx, { teamId, type, priority });
    const createdAt = new Date();
    const deadlines = computeDeadlines(policy, createdAt);

    const created = await tx.ticket.create({
      data: {
        title: input.title,
        description: input.description,
        type,
        priority,
        status: "OPEN",
        teamId,
        categoryId: input.categoryId ?? null,
        projectId: input.projectId ?? null,
        requesterId: input.requesterId,
        assigneeId: input.assigneeId ?? null,
        dueAt: input.dueAt ?? null,
        estimateMinutes: input.estimateMinutes ?? null,
        source: input.source ?? "WEB",
        externalRef: input.externalRef ?? null,
        createdAt,
        ...deadlines,
        ...(input.tagIds?.length
          ? { tags: { connect: input.tagIds.map((id) => ({ id })) } }
          : {}),
      },
      include: ticketInclude,
    });

    await tx.ticketEvent.create({
      data: {
        ticketId: created.id,
        actorId: input.requesterId,
        type: "CREATED",
        createdAt,
        metadata: { type, priority, teamId, source: created.source },
      },
    });

    await tx.ticketStatusPeriod.create({
      data: {
        ticketId: created.id,
        status: "OPEN",
        assigneeId: created.assigneeId,
        startedAt: createdAt,
      },
    });

    if (created.assigneeId) {
      await tx.ticketEvent.create({
        data: {
          ticketId: created.id,
          actorId: input.requesterId,
          type: "ASSIGNED",
          field: "assigneeId",
          toValue: String(created.assigneeId),
        },
      });
    }

    return created;
  });

  emitWebhook("ticket.created", serializeTicket(ticket));
  return ticket;
}

// ===================== TRANSIÇÃO DE STATUS =====================

export async function changeStatus(
  ticketId: number,
  toStatus: TicketStatus,
  actorId: number | null,
  note?: string,
) {
  const result = await prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      include: ticketInclude,
    });
    if (ticket.status === toStatus) return { ticket, changed: false as const };

    const policy = await loadPolicyFor(tx, {
      teamId: ticket.teamId,
      type: ticket.type,
      priority: ticket.priority,
    });

    const now = new Date();
    const closed = await closeOpenPeriod(tx, ticketId, now, policy);

    await tx.ticketStatusPeriod.create({
      data: {
        ticketId,
        status: toStatus,
        assigneeId: ticket.assigneeId,
        startedAt: now,
      },
    });

    const data: Prisma.TicketUpdateInput = { status: toStatus };

    // Saindo de uma espera: o prazo de solução ganha de volta o tempo em que
    // a bola não estava com o time.
    if (closed && isWaiting(closed.status) && !isWaiting(toStatus)) {
      const extended = extendDeadlineForPause(
        ticket.resolutionDueAt,
        closed.businessMinutes,
        policy,
      );
      if (extended) data.resolutionDueAt = extended;
    }

    if (toStatus === "IN_PROGRESS" && !ticket.startedAt) {
      data.startedAt = now;
    }

    // Reabertura: sai de um status final e volta a correr o relógio.
    const reopening = isTerminal(ticket.status) && !isTerminal(toStatus);
    if (reopening) {
      data.reopenCount = { increment: 1 };
      data.resolvedAt = null;
      data.closedAt = null;
      data.resolutionMinutes = null;
    }

    if (toStatus === "RESOLVED" && !ticket.resolvedAt) {
      data.resolvedAt = now;
      data.resolutionMinutes = elapsedMinutes(ticket.createdAt, now, policy);
      if (ticket.resolutionDueAt && now > ticket.resolutionDueAt) {
        data.slaResolutionBreached = true;
      }
    }

    if (toStatus === "CLOSED") {
      data.closedAt = now;
      if (!ticket.resolvedAt) {
        data.resolvedAt = now;
        data.resolutionMinutes = elapsedMinutes(ticket.createdAt, now, policy);
      }
    }

    if (toStatus === "CANCELLED") {
      data.closedAt = now;
    }

    // O período recém-fechado já entra na conta, então isto vai junto no mesmo
    // update — o objeto devolvido (e o corpo do webhook) sai consistente.
    data.workingMinutes = await recomputeWorkingMinutes(tx, ticketId);

    const updated = await tx.ticket.update({
      where: { id: ticketId },
      data,
      include: ticketInclude,
    });

    await tx.ticketEvent.create({
      data: {
        ticketId,
        actorId,
        type: reopening ? "REOPENED" : "STATUS_CHANGED",
        field: "status",
        fromValue: ticket.status,
        toValue: toStatus,
        createdAt: now,
        ...(note ? { metadata: { note } } : {}),
      },
    });

    return { ticket: updated, changed: true as const, reopening };
  });

  if (result.changed) {
    const payload = serializeTicket(result.ticket);
    emitWebhook("ticket.status_changed", payload);
    if (result.reopening) emitWebhook("ticket.reopened", payload);
    if (toStatus === "RESOLVED") emitWebhook("ticket.resolved", payload);
    if (toStatus === "CLOSED") emitWebhook("ticket.closed", payload);
  }

  return result.ticket;
}

// ===================== ATRIBUIÇÃO =====================

export async function assignTicket(
  ticketId: number,
  assigneeId: number | null,
  actorId: number | null,
) {
  const ticket = await prisma.$transaction(async (tx) => {
    const current = await tx.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      include: ticketInclude,
    });
    if (current.assigneeId === assigneeId) return current;

    const updated = await tx.ticket.update({
      where: { id: ticketId },
      data: { assigneeId },
      include: ticketInclude,
    });

    // O período em aberto passa a valer para o novo responsável, senão o
    // tempo apareceria na carteira de quem já saiu do chamado.
    await tx.ticketStatusPeriod.updateMany({
      where: { ticketId, endedAt: null },
      data: { assigneeId },
    });

    await tx.ticketEvent.create({
      data: {
        ticketId,
        actorId,
        type: assigneeId ? "ASSIGNED" : "UNASSIGNED",
        field: "assigneeId",
        fromValue: current.assigneeId ? String(current.assigneeId) : null,
        toValue: assigneeId ? String(assigneeId) : null,
      },
    });

    return updated;
  });

  if (assigneeId) emitWebhook("ticket.assigned", serializeTicket(ticket));
  return ticket;
}

// ===================== COMENTÁRIOS =====================

export interface AddCommentInput {
  ticketId: number;
  authorId: number;
  body: string;
  internal?: boolean;
  source?: TicketSource;
}

export async function addComment(input: AddCommentInput) {
  const internal = input.internal ?? false;

  const { comment, ticket, firstResponse } = await prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findUniqueOrThrow({
      where: { id: input.ticketId },
      include: ticketInclude,
    });
    const author = await tx.user.findUniqueOrThrow({
      where: { id: input.authorId },
      select: { role: true },
    });

    const now = new Date();
    const comment = await tx.comment.create({
      data: {
        ticketId: input.ticketId,
        authorId: input.authorId,
        body: input.body,
        internal,
        source: input.source ?? "WEB",
        createdAt: now,
      },
    });

    await tx.ticketEvent.create({
      data: {
        ticketId: input.ticketId,
        actorId: input.authorId,
        type: internal ? "INTERNAL_NOTE_ADDED" : "COMMENT_ADDED",
        createdAt: now,
        metadata: { commentId: comment.id },
      },
    });

    // Nota interna não conta como resposta ao solicitante — ele nem a vê.
    const countsAsResponse =
      !internal && !ticket.firstResponseAt && RESPONDER_ROLES.includes(author.role);

    let updated = ticket;
    if (countsAsResponse) {
      const policy = await loadPolicyFor(tx, {
        teamId: ticket.teamId,
        type: ticket.type,
        priority: ticket.priority,
      });

      const minutes = elapsedMinutes(ticket.createdAt, now, policy);
      const breached = Boolean(ticket.responseDueAt && now > ticket.responseDueAt);

      updated = await tx.ticket.update({
        where: { id: ticket.id },
        data: {
          firstResponseAt: now,
          firstResponseMinutes: minutes,
          slaResponseBreached: breached,
        },
        include: ticketInclude,
      });

      await tx.ticketEvent.create({
        data: {
          ticketId: ticket.id,
          actorId: input.authorId,
          type: "FIRST_RESPONSE",
          createdAt: now,
          metadata: { minutes, breached },
        },
      });

      if (breached) {
        await tx.ticketEvent.create({
          data: {
            ticketId: ticket.id,
            type: "SLA_RESPONSE_BREACHED",
            createdAt: now,
            metadata: { dueAt: ticket.responseDueAt, respondedAt: now },
          },
        });
      }
    }

    return { comment, ticket: updated, firstResponse: countsAsResponse };
  });

  if (!internal) {
    emitWebhook("ticket.commented", {
      ...serializeTicket(ticket),
      comment: { id: comment.id, body: comment.body, authorId: comment.authorId },
    });
  }
  if (firstResponse && ticket.slaResponseBreached) {
    emitWebhook("sla.response_breached", serializeTicket(ticket));
  }

  return comment;
}

// ===================== VARREDURA DE SLA =====================

/**
 * Marca os estouros de prazo que ninguém "causou" — o SLA vence sozinho, sem
 * nenhuma ação de usuário para disparar a checagem. Roda em /api/cron/sla.
 */
export async function sweepSlaBreaches(): Promise<{ response: number; resolution: number }> {
  const now = new Date();

  const responseOverdue = await prisma.ticket.findMany({
    where: {
      firstResponseAt: null,
      slaResponseBreached: false,
      responseDueAt: { lt: now },
      status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED"] },
    },
    include: ticketInclude,
  });

  for (const ticket of responseOverdue) {
    await prisma.$transaction([
      prisma.ticket.update({
        where: { id: ticket.id },
        data: { slaResponseBreached: true },
      }),
      prisma.ticketEvent.create({
        data: {
          ticketId: ticket.id,
          type: "SLA_RESPONSE_BREACHED",
          metadata: { dueAt: ticket.responseDueAt },
        },
      }),
    ]);
    emitWebhook("sla.response_breached", serializeTicket(ticket));
  }

  const resolutionOverdue = await prisma.ticket.findMany({
    where: {
      slaResolutionBreached: false,
      resolutionDueAt: { lt: now },
      status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED"] },
    },
    include: ticketInclude,
  });

  for (const ticket of resolutionOverdue) {
    await prisma.$transaction([
      prisma.ticket.update({
        where: { id: ticket.id },
        data: { slaResolutionBreached: true },
      }),
      prisma.ticketEvent.create({
        data: {
          ticketId: ticket.id,
          type: "SLA_RESOLUTION_BREACHED",
          metadata: { dueAt: ticket.resolutionDueAt },
        },
      }),
    ]);
    emitWebhook("sla.resolution_breached", serializeTicket(ticket));
  }

  return { response: responseOverdue.length, resolution: resolutionOverdue.length };
}

// ===================== SERIALIZAÇÃO =====================

type TicketWithRelations = Prisma.TicketGetPayload<{ include: typeof ticketInclude }>;

/**
 * Formato público do ticket — usado tanto no corpo dos webhooks quanto nas
 * respostas de /api/v1, para o n8n ver sempre a mesma estrutura. Nunca inclui
 * hash de senha nem notas internas.
 */
export function serializeTicket(ticket: TicketWithRelations) {
  return {
    id: ticket.id,
    title: ticket.title,
    description: ticket.description,
    type: ticket.type,
    status: ticket.status,
    priority: ticket.priority,
    source: ticket.source,
    externalRef: ticket.externalRef,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    dueAt: ticket.dueAt?.toISOString() ?? null,
    team: ticket.team ? { id: ticket.team.id, name: ticket.team.name } : null,
    category: ticket.category ? { id: ticket.category.id, name: ticket.category.name } : null,
    project: ticket.project
      ? { id: ticket.project.id, key: ticket.project.key, name: ticket.project.name }
      : null,
    requester: ticket.requester
      ? { id: ticket.requester.id, name: ticket.requester.name, email: ticket.requester.email }
      : null,
    assignee: ticket.assignee
      ? { id: ticket.assignee.id, name: ticket.assignee.name, email: ticket.assignee.email }
      : null,
    metrics: {
      firstResponseAt: ticket.firstResponseAt?.toISOString() ?? null,
      firstResponseMinutes: ticket.firstResponseMinutes,
      startedAt: ticket.startedAt?.toISOString() ?? null,
      resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
      closedAt: ticket.closedAt?.toISOString() ?? null,
      resolutionMinutes: ticket.resolutionMinutes,
      workingMinutes: ticket.workingMinutes,
      reopenCount: ticket.reopenCount,
    },
    sla: {
      responseDueAt: ticket.responseDueAt?.toISOString() ?? null,
      resolutionDueAt: ticket.resolutionDueAt?.toISOString() ?? null,
      responseBreached: ticket.slaResponseBreached,
      resolutionBreached: ticket.slaResolutionBreached,
    },
  };
}
