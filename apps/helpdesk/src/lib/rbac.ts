import type { Role } from "@/generated/prisma/enums";

// Regras de permissão, puras e sem dependência de banco ou de sessão.
//
// Separadas de session.ts (que importa o Auth.js, e por tabela o Prisma e a
// validação de ambiente) para que a decisão de quem-vê-o-quê possa ser testada
// isoladamente. É a parte do sistema em que um engano é caro.
//
// São dois níveis:
//   ADMIN — atende os chamados de todos os setores e configura o sistema.
//   USER  — abre e acompanha os próprios chamados, e nada mais.

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  teamId: number | null;
}

export function isAdmin(role: Role): boolean {
  return role === "ADMIN";
}

/** Só o administrador atribui responsável, muda status livremente e usa nota interna. */
export function canEditTicket(user: SessionUser): boolean {
  return isAdmin(user.role);
}

/**
 * Filtro de visibilidade de chamados. O usuário comum só enxerga o que abriu
 * ou o que está acompanhando — aplicado na consulta, nunca só na tela, para
 * que nenhuma contagem, página ou exportação escape por acidente.
 * Devolve objeto vazio para o administrador, que enxerga tudo.
 */
export function ticketVisibilityFilter(user: SessionUser) {
  if (isAdmin(user.role)) return {};
  return {
    OR: [{ requesterId: user.id }, { watchers: { some: { userId: user.id } } }],
  };
}

/**
 * Um chamado específico pode ser aberto pelo administrador, por quem o criou
 * ou por quem o acompanha. Usado na página de detalhe, onde o filtro de lista
 * não se aplica.
 */
export function canViewTicket(
  user: SessionUser,
  ticket: { requesterId: number; watcherIds?: number[] },
): boolean {
  if (isAdmin(user.role)) return true;
  if (ticket.requesterId === user.id) return true;
  return Boolean(ticket.watcherIds?.includes(user.id));
}
