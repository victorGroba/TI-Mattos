import { redirect } from "next/navigation";
import { auth } from "./auth";
import { isAdmin, type SessionUser } from "./rbac";

// Guardas de acesso do lado do servidor.
//
// A proteção mora aqui, nos layouts e nas server actions, e não em proxy.ts:
// o proxy roda antes da renderização e não enxerga o banco, então serviria só
// para uma checagem superficial de cookie. Verificar no servidor, onde a
// consulta acontece, é o que impede alguém de chegar ao dado por outra rota.
//
// As regras em si vivem em rbac.ts, sem dependências — este arquivo só liga a
// sessão do Auth.js a elas.

export * from "./rbac";

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  // Único ponto de conversão: o Auth.js trabalha com id em string, o banco com
  // Int. Um id não numérico significa sessão corrompida, não usuário zero.
  const id = Number(session.user.id);
  if (!Number.isInteger(id) || id <= 0) return null;

  return {
    id,
    name: session.user.name ?? "",
    email: session.user.email ?? "",
    role: session.user.role,
    teamId: session.user.teamId,
  };
}

/** Exige sessão. Redireciona para o login preservando o destino pretendido. */
export async function requireUser(returnTo?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    const target = returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login";
    redirect(target);
  }
  return user;
}

/**
 * Exige administrador. O usuário comum é mandado para os próprios chamados —
 * a única área que existe para ele.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isAdmin(user.role)) redirect("/meus-chamados");
  return user;
}
