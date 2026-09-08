import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";
import type { SessionUser } from "./rbac";
import { PAGE_SIZE, buildTicketWhere, type TicketFilters } from "./ticket-where";

export { PAGE_SIZE, buildTicketWhere };
export type { TicketFilters };

// Consultas de listagem. Ficam separadas de tickets.ts (que só escreve) para
// deixar claro qual código pode mudar estado e qual não pode.

export const ticketListSelect = {
  id: true,
  title: true,
  status: true,
  priority: true,
  type: true,
  createdAt: true,
  updatedAt: true,
  resolutionDueAt: true,
  slaResolutionBreached: true,
  firstResponseAt: true,
  resolutionMinutes: true,
  team: { select: { id: true, name: true } },
  project: { select: { id: true, key: true } },
  requester: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true } },
} satisfies Prisma.TicketSelect;

export type TicketListItem = Prisma.TicketGetPayload<{ select: typeof ticketListSelect }>;

export async function listTickets(user: SessionUser, filters: TicketFilters) {
  const where = buildTicketWhere(user, filters);
  const page = Math.max(1, filters.page ?? 1);

  const [items, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      select: ticketListSelect,
      // Urgentes primeiro, depois os mais recentes: é a ordem em que a fila
      // deve ser atacada, não a ordem em que os chamados chegaram.
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.ticket.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/** Dados dos <select> de filtro e do formulário de abertura. */
export async function getFormOptions() {
  const [teams, categories, projects, agents] = await Promise.all([
    prisma.team.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({
      where: { active: true },
      select: { id: true, name: true, teamId: true, defaultType: true },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      where: { status: { in: ["PLANNING", "ACTIVE", "ON_HOLD"] } },
      select: { id: true, name: true, key: true },
      orderBy: { name: "asc" },
    }),
    // Só administrador pode ser responsável por um chamado.
    prisma.user.findMany({
      where: { active: true, role: "ADMIN" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return { teams, categories, projects, agents };
}

/** Detalhe completo, com o histórico já ordenado para a linha do tempo. */
export async function getTicketDetail(id: number) {
  return prisma.ticket.findUnique({
    where: { id },
    include: {
      team: true,
      category: true,
      project: true,
      requester: { select: { id: true, name: true, email: true, role: true } },
      assignee: { select: { id: true, name: true, email: true } },
      slaPolicy: { select: { id: true, name: true } },
      tags: true,
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true, role: true } } },
      },
      events: {
        orderBy: { createdAt: "asc" },
        include: { actor: { select: { id: true, name: true } } },
      },
      timeEntries: {
        orderBy: { spentOn: "desc" },
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });
}

export type TicketDetail = NonNullable<Awaited<ReturnType<typeof getTicketDetail>>>;
