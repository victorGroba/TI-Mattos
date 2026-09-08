import type { Prisma } from "@/generated/prisma/client";
import type { Priority, TicketStatus, TicketType } from "@/generated/prisma/enums";
import { activeStatuses } from "./labels";
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
  page?: number;
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

  if (filters.requesterOnly) where.requesterId = user.id;

  if (filters.status) where.status = filters.status;
  else if (filters.onlyOpen) where.status = { in: activeStatuses };

  if (filters.teamId) where.teamId = filters.teamId;
  if (filters.type) where.type = filters.type;
  if (filters.priority) where.priority = filters.priority;
  if (filters.categoryId) where.categoryId = filters.categoryId;
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
