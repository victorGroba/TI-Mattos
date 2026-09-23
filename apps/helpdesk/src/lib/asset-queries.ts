import type { Prisma } from "@/generated/prisma/client";
import type { AssetStatus, AssetType } from "@/generated/prisma/enums";
import { checkOverdueSince } from "./inventory";
import { assetStatusLabels, assetTypeLabels } from "./labels";
import { prisma } from "./prisma";

// Filtros do inventário. A tela e a exportação em CSV passam pelo MESMO
// construtor: a planilha baixada precisa ser exatamente o que estava na tela.

export type Pendency = "termo" | "conferencia" | "foto" | "sem-responsavel";

export const pendencyLabels: Record<Pendency, string> = {
  termo: "Termo não assinado",
  conferencia: "Conferência vencida",
  foto: "Sem foto",
  "sem-responsavel": "Sem responsável",
};

export interface AssetFilters {
  q?: string;
  type?: AssetType;
  /** Ausente = todos menos os baixados; "todos" inclui os baixados. */
  status?: AssetStatus | "todos";
  teamId?: number | "nenhum";
  pendency?: Pendency;
}

/** Lê os filtros da URL, descartando o que não for um valor conhecido. */
export function parseAssetFilters(
  params: Record<string, string | string[] | undefined>,
): AssetFilters {
  const one = (k: string) => {
    const v = params[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
  };

  const tipo = one("tipo");
  const status = one("status");
  const setor = one("setor");
  const pendencia = one("pendencia");

  return {
    q: one("q"),
    type: tipo && tipo in assetTypeLabels ? (tipo as AssetType) : undefined,
    status:
      status === "todos"
        ? "todos"
        : status && status in assetStatusLabels
          ? (status as AssetStatus)
          : undefined,
    teamId:
      setor === "nenhum" ? "nenhum" : Number.isInteger(Number(setor)) && Number(setor) > 0 ? Number(setor) : undefined,
    pendency: pendencia && pendencia in pendencyLabels ? (pendencia as Pendency) : undefined,
  };
}

export function buildAssetWhere(f: AssetFilters, now: Date = new Date()): Prisma.AssetWhereInput {
  const and: Prisma.AssetWhereInput[] = [];

  if (f.status === undefined) and.push({ status: { not: "RETIRED" } });
  else if (f.status !== "todos") and.push({ status: f.status });

  if (f.type) and.push({ type: f.type });
  if (f.teamId === "nenhum") and.push({ teamId: null });
  else if (f.teamId) and.push({ teamId: f.teamId });

  switch (f.pendency) {
    case "termo":
      and.push({ terms: { some: { status: "PENDING" } } });
      break;
    case "conferencia":
      and.push({
        OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: checkOverdueSince(now) } }],
      });
      break;
    case "foto":
      and.push({ photos: { none: {} } });
      break;
    case "sem-responsavel":
      and.push({ assigneeId: null });
      break;
  }

  if (f.q) {
    const contains = { contains: f.q, mode: "insensitive" as const };
    and.push({
      OR: [
        { tag: contains },
        { hostname: contains },
        { brand: contains },
        { model: contains },
        { serialNumber: contains },
        { ipAddress: contains },
        { location: contains },
        { remoteAccess: contains },
        { assignee: { name: contains } },
      ],
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

/** Filtros atuais como query string, para os links de exportação e de visão. */
export function filtersToQuery(f: AssetFilters): URLSearchParams {
  const q = new URLSearchParams();
  if (f.q) q.set("q", f.q);
  if (f.type) q.set("tipo", f.type);
  if (f.status) q.set("status", f.status);
  if (f.teamId) q.set("setor", String(f.teamId));
  if (f.pendency) q.set("pendencia", f.pendency);
  return q;
}

/** Campos carregados para cartões e linhas da listagem. */
export const assetListSelect = {
  id: true,
  tag: true,
  type: true,
  status: true,
  hostname: true,
  brand: true,
  model: true,
  processor: true,
  memory: true,
  storage: true,
  operatingSystem: true,
  location: true,
  lastCheckedAt: true,
  team: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true } },
  // A primeira foto é a capa: é a que o suporte tira de frente, no cadastro.
  // As seguintes costumam ser de etiqueta e de detalhe.
  photos: { select: { id: true }, orderBy: { createdAt: "asc" }, take: 1 },
  terms: {
    where: { status: { in: ["PENDING", "SIGNED"] } },
    select: { id: true, status: true },
    orderBy: { issuedAt: "desc" },
    take: 1,
  },
} satisfies Prisma.AssetSelect;

export type AssetListItem = Prisma.AssetGetPayload<{ select: typeof assetListSelect }>;

// ===================== FORMULÁRIO =====================

const SUGGESTION_FIELDS = [
  "brand",
  "model",
  "processor",
  "memory",
  "storage",
  "operatingSystem",
  "location",
] as const;

/**
 * Opções do formulário: setores, pessoas e os valores já digitados em outros
 * cadastros. As sugestões fazem o segundo notebook Dell sair em dois toques e
 * mantêm a grafia igual entre máquinas ("16 GB", não "16gb" numa e "16 G" na
 * outra) — o que faz o filtro e a planilha funcionarem depois.
 */
export async function getAssetFormOptions() {
  const [teams, users, cadastrados] = await Promise.all([
    prisma.team.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { active: true, email: { not: "integracao@sistema.local" } },
      select: { id: true, name: true, teamId: true },
      orderBy: { name: "asc" },
    }),
    // Uma consulta só: o inventário tem dezenas de linhas, e tirar as
    // repetições aqui sai mais simples que um DISTINCT por campo.
    prisma.asset.findMany({
      select: Object.fromEntries(SUGGESTION_FIELDS.map((c) => [c, true])) as Record<
        (typeof SUGGESTION_FIELDS)[number],
        true
      >,
      take: 2000,
    }),
  ]);

  const suggestions = Object.fromEntries(
    SUGGESTION_FIELDS.map((campo) => [
      campo,
      [...new Set(cadastrados.map((a) => a[campo]?.trim()).filter((v): v is string => Boolean(v)))].sort(
        (a, b) => a.localeCompare(b, "pt-BR"),
      ),
    ]),
  );

  return { teams, users, suggestions };
}

/** Data para o valor de <input type="date">. */
export function toDateInput(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}
