import { prisma } from "./prisma";
import { activeStatuses } from "./labels";
import { isAdmin, type SessionUser } from "./rbac";
import { buildTicketWhere } from "./ticket-where";

// Contadores da navegação lateral.
//
// São números de operação, não enfeite: mostram o tamanho da fila sem obrigar
// a pessoa a entrar na tela para descobrir. Por isso passam pelo MESMO
// buildTicketWhere da listagem — se o contador usasse outra regra, ele diria
// "40" e a tela abriria com 12, o que é pior que não ter contador nenhum.

export interface SidebarCounts {
  /** Chave é o href do item de navegação. */
  counts: Record<string, number>;
  /** Itens que devem exibir sinal de atenção (SLA estourado na fila). */
  alerts: Record<string, boolean>;
}

export async function getSidebarCounts(user: SessionUser): Promise<SidebarCounts> {
  const admin = isAdmin(user.role);

  const [queue, overdue, mine, projects] = await Promise.all([
    admin
      ? prisma.ticket.count({ where: buildTicketWhere(user, { onlyOpen: true }) })
      : Promise.resolve(0),
    admin
      ? prisma.ticket.count({
          where: {
            ...buildTicketWhere(user, { onlyOpen: true }),
            slaResolutionBreached: true,
          },
        })
      : Promise.resolve(0),
    prisma.ticket.count({
      where: { requesterId: user.id, status: { in: activeStatuses } },
    }),
    admin
      ? prisma.project.count({ where: { status: { in: ["PLANNING", "ACTIVE"] } } })
      : Promise.resolve(0),
  ]);

  return {
    counts: {
      "/chamados": queue,
      "/meus-chamados": mine,
      "/projetos": projects,
    },
    alerts: {
      "/chamados": overdue > 0,
    },
  };
}
