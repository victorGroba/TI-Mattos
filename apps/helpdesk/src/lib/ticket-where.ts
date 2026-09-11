import type { Prisma } from "@/generated/prisma/client";
import type { Priority, TicketStatus, TicketType } from "@/generated/prisma/enums";
import { activeStatuses } from "./labels";
import { toZonedParts, zonedTimeToUtc } from "./business-hours";
import { ticketVisibilityFilter, type SessionUser } from "./rbac";

// Montagem pura do filtro de listagem. Fica separado de ticket-queries.ts, que
// importa o client do Prisma (e, por tabela, a validação de ambiente): assim
// esta lógica — que é onde mora a regra de visibilidade — pode ser testada
// sem banco e sem variáveis de ambiente.

export const PAGE_SIZE = 25;

export interface TicketFilters {
  status?: TicketStatus;
  /** Atalho da UI: tudo que ainda não foi encerrado. */
  onlyOpen?: boolean;
  teamId?: number;
  type?: TicketType;
  priority?: Priority;
  categoryId?: number;
  assigneeId?: number;
  /** -1 significa "sem responsável". */
  unassigned?: boolean;
  projectId?: number;
  search?: string;
  overdue?: boolean;
  /** Restringe a quem abriu — a tela "Meus chamados", mesmo para atendentes. */
  requesterOnly?: boolean;
  /**
   * Como tratar os arquivados. Padrão: fora de tudo.
   *   "ativos"  — só os não arquivados
   *   "todos"   — ativos e arquivados juntos
   *   "somente" — só os arquivados, para consultar o histórico descartado
   */
  archived?: ArchivedMode;
  sort?: TicketSort;
  period?: TicketPeriod;
  page?: number;
}

// ---------- Período ----------

export const TICKET_PERIODS = ["tudo", "hoje", "semana", "mes", "90dias"] as const;
export type TicketPeriod = (typeof TICKET_PERIODS)[number];

export const PERIOD_LABELS: Record<TicketPeriod, string> = {
  tudo: "Todo o período",
  hoje: "Hoje",
  semana: "Esta semana",
  mes: "Este mês",
  "90dias": "Últimos 90 dias",
};

export function parsePeriod(value: string | undefined): TicketPeriod {
  return TICKET_PERIODS.includes(value as TicketPeriod)
    ? (value as TicketPeriod)
    : "tudo";
}

const FUSO = "America/Sao_Paulo";

/**
 * Início do período, em UTC.
 *
 * "Hoje", "esta semana" e "este mês" são recortes de CALENDÁRIO, não janelas
 * móveis: quem pergunta "quantos chamados hoje" quer desde a meia-noite, não
 * as últimas 24 horas. E a meia-noite é a de São Paulo — o container roda em
 * UTC, e usar o relógio dele jogaria as três primeiras horas de cada dia para
 * o dia anterior.
 *
 * A semana começa na segunda, como no calendário brasileiro.
 */
export function periodStart(period: TicketPeriod, agora = new Date()): Date | null {
  if (period === "tudo") return null;

  const hoje = toZonedParts(agora, FUSO);
  const meiaNoite = (diasAtras = 0) => {
    const base = zonedTimeToUtc(hoje.year, hoje.month, hoje.day, 0, 0, FUSO);
    return new Date(base.getTime() - diasAtras * 86_400_000);
  };

  switch (period) {
    case "hoje":
      return meiaNoite();
    case "semana":
      // isoWeekday: 1 = segunda. Na segunda o recorte é o próprio dia.
      return meiaNoite(hoje.isoWeekday - 1);
    case "mes":
      return zonedTimeToUtc(hoje.year, hoje.month, 1, 0, 0, FUSO);
    case "90dias":
      return meiaNoite(90);
    default:
      return null;
  }
}

export const ARCHIVED_MODES = ["ativos", "todos", "somente"] as const;
export type ArchivedMode = (typeof ARCHIVED_MODES)[number];

export function parseArchived(value: string | undefined): ArchivedMode {
  if (value === "1") return "todos";
  if (value === "so") return "somente";
  return "ativos";
}

/** Ordenações oferecidas na fila. */
export const TICKET_SORTS = ["recentes", "antigos", "prioridade"] as const;
export type TicketSort = (typeof TICKET_SORTS)[number];

export const SORT_LABELS: Record<TicketSort, string> = {
  recentes: "Mais recentes",
  antigos: "Mais antigos",
  prioridade: "Prioridade",
};

export function parseSort(value: string | undefined): TicketSort {
  return TICKET_SORTS.includes(value as TicketSort) ? (value as TicketSort) : "recentes";
}

/**
 * Ordem da fila. O padrão é o mais recente primeiro.
 *
 * Ordenar por prioridade por padrão parecia esperto e era nocivo: como todo
 * chamado nasce com prioridade média e a triagem é que ajusta, o recém-chegado
 * — justamente o que ninguém olhou ainda — ia parar embaixo de todos os
 * antigos marcados como altos. O chamado novo sumia da vista.
 *
 * A prioridade continua disponível como ordenação escolhida, para responder
 * "o que eu ataco agora", e permanece visível em toda linha pelo badge.
 */
export function buildTicketOrder(
  sort: TicketSort = "recentes",
): Prisma.TicketOrderByWithRelationInput[] {
  switch (sort) {
    case "antigos":
      return [{ createdAt: "asc" }];
    case "prioridade":
      // O desempate por data mantém a ordem estável dentro de cada prioridade.
      return [{ priority: "desc" }, { createdAt: "desc" }];
    default:
      return [{ createdAt: "desc" }];
  }
}

/**
 * Monta o `where` já com o recorte de visibilidade do usuário. O filtro de
 * permissão entra na consulta, não na renderização — assim nenhuma contagem,
 * página ou export escapa por acidente.
 */
export function buildTicketWhere(
  user: SessionUser,
  filters: TicketFilters,
): Prisma.TicketWhereInput {
  // Visibilidade e busca ficam em cláusulas AND separadas de propósito. Ambas
  // precisam de um OR, e escrever as duas na mesma chave `OR` faria a segunda
  // sobrescrever a primeira — o que deixaria a busca de um solicitante
  // enxergar chamados de outras pessoas.
  const and: Prisma.TicketWhereInput[] = [];

  const visibility = ticketVisibilityFilter(user);
  if (Object.keys(visibility).length > 0) and.push(visibility);

  const where: Prisma.TicketWhereInput = {};

  // Arquivado sai de tudo por padrão: fila, contadores, painel e relatórios.
  // O filtro mora aqui, na montagem única do where, e não em cada tela — foi
  // assim que a regra de visibilidade deixou de ter como escapar por uma rota
  // esquecida.
  const modo = filters.archived ?? "ativos";
  if (modo === "ativos") where.archivedAt = null;
  else if (modo === "somente") where.archivedAt = { not: null };

  if (filters.requesterOnly) where.requesterId = user.id;

  if (filters.status) where.status = filters.status;
  else if (filters.onlyOpen) where.status = { in: activeStatuses };

  if (filters.teamId) where.teamId = filters.teamId;
  if (filters.type) where.type = filters.type;
  if (filters.priority) where.priority = filters.priority;
  if (filters.categoryId) where.categoryId = filters.categoryId;

  const desde = periodStart(filters.period ?? "tudo");
  if (desde) where.createdAt = { gte: desde };
  if (filters.projectId) where.projectId = filters.projectId;

  if (filters.unassigned) where.assigneeId = null;
  else if (filters.assigneeId) where.assigneeId = filters.assigneeId;

  if (filters.overdue) {
    where.slaResolutionBreached = true;
    where.status = { in: activeStatuses };
  }

  if (filters.search) {
    const term = filters.search.trim();
    if (term) {
      // Número puro busca pelo id — é como as pessoas se referem ao chamado.
      const asId = Number(term.replace(/^#/, ""));
      and.push({
        OR:
          Number.isInteger(asId) && asId > 0
            ? [{ id: asId }, { title: { contains: term, mode: "insensitive" } }]
            : [
                { title: { contains: term, mode: "insensitive" } },
                { description: { contains: term, mode: "insensitive" } },
              ],
      });
    }
  }

  if (and.length > 0) where.AND = and;

  return where;
}
