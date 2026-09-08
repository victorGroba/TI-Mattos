import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "./prisma";

// Autenticação das rotas /api/v1, usadas pelo n8n e por qualquer outro sistema.
//
// O token é guardado só como hash SHA-256. Diferente de senha de usuário, um
// token tem 256 bits de entropia aleatória: não há dicionário a proteger, então
// um hash rápido é o certo — bcrypt aqui só adicionaria latência a cada
// chamada de API sem ganho de segurança.

const TOKEN_PREFIX = "hd_";
const PREFIX_LENGTH = 12;

export const API_SCOPES = [
  "tickets:read",
  "tickets:write",
  "metrics:read",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export const API_SCOPE_LABELS: Record<ApiScope, string> = {
  "tickets:read": "Ler chamados",
  "tickets:write": "Abrir e atualizar chamados",
  "metrics:read": "Ler métricas e relatórios",
};

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Gera um token novo. O valor em claro só existe neste retorno — é mostrado
 * uma única vez na tela e nunca mais pode ser recuperado.
 */
export function generateToken(): { token: string; prefix: string; tokenHash: string } {
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return {
    token,
    prefix: token.slice(0, PREFIX_LENGTH),
    tokenHash: hashToken(token),
  };
}

export interface ApiAuthResult {
  ok: true;
  tokenId: number;
  scopes: string[];
}

export interface ApiAuthFailure {
  ok: false;
  response: Response;
}

function unauthorized(message: string): ApiAuthFailure {
  return {
    ok: false,
    response: Response.json(
      { error: message },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    ),
  };
}

function forbidden(message: string): ApiAuthFailure {
  return { ok: false, response: Response.json({ error: message }, { status: 403 }) };
}

/**
 * Valida o header Authorization e o escopo exigido pela rota.
 *
 * A busca é pelo prefixo (indexado) e a confirmação é uma comparação em tempo
 * constante do hash — assim o tempo de resposta não revela quantos caracteres
 * de um token chutado estavam certos.
 */
export async function authenticateApi(
  request: Request,
  requiredScope: ApiScope,
): Promise<ApiAuthResult | ApiAuthFailure> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return unauthorized("Envie o token no header Authorization: Bearer <token>.");
  }

  const presented = header.slice("Bearer ".length).trim();
  if (!presented.startsWith(TOKEN_PREFIX) || presented.length < PREFIX_LENGTH + 8) {
    return unauthorized("Token inválido.");
  }

  const record = await prisma.apiToken.findUnique({
    where: { prefix: presented.slice(0, PREFIX_LENGTH) },
  });
  if (!record) return unauthorized("Token inválido.");

  const expected = Buffer.from(record.tokenHash, "utf8");
  const received = Buffer.from(hashToken(presented), "utf8");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return unauthorized("Token inválido.");
  }

  if (record.revokedAt) return unauthorized("Token revogado.");
  if (record.expiresAt && record.expiresAt < new Date()) {
    return unauthorized("Token expirado.");
  }

  if (!record.scopes.includes(requiredScope)) {
    return forbidden(`Este token não tem o escopo "${requiredScope}".`);
  }

  // Registro de uso sem bloquear a resposta — serve para o admin identificar
  // tokens esquecidos, e não vale atrasar a chamada por isso.
  void prisma.apiToken
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { ok: true, tokenId: record.id, scopes: record.scopes };
}

/**
 * Usuário sob o qual as ações vindas da API são registradas, para que a
 * auditoria nunca tenha autor vazio. Criado sob demanda.
 */
export async function getIntegrationUser(): Promise<number> {
  const email = "integracao@sistema.local";

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) return existing.id;

  const team = await prisma.team.findFirst({
    where: { active: true },
    orderBy: { id: "asc" },
    select: { id: true },
  });

  const created = await prisma.user.create({
    data: {
      name: "Integração",
      email,
      // Hash impossível de satisfazer: esta conta nunca faz login pela tela.
      passwordHash: "!",
      role: "ADMIN",
      teamId: team?.id ?? null,
      active: false,
    },
    select: { id: true },
  });

  return created.id;
}
