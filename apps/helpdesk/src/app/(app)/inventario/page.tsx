import Link from "next/link";
import type { Metadata } from "next";
import { Download, FileText, LayoutGrid, List, MonitorSmartphone, Plus, Search } from "lucide-react";
import { AssetCard } from "@/components/inventory/asset-card";
import {
  AssetStatusBadge,
  AssetTypeIcon,
  TermStatusBadge,
} from "@/components/inventory/asset-visuals";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Avatar, EmptyState, PageHeader } from "@/components/ui/misc";
import { Section } from "@/components/ui/section";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import {
  assetListSelect,
  buildAssetWhere,
  filtersToQuery,
  parseAssetFilters,
  pendencyLabels,
  type AssetFilters,
  type AssetListItem,
  type Pendency,
} from "@/lib/asset-queries";
import { formatRelative } from "@/lib/format";
import { assetName, checkOverdueSince, isCheckOverdue } from "@/lib/inventory";
import {
  assetStatusLabels,
  assetStatusOrder,
  assetTypeLabels,
  assetTypeOrder,
} from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Inventário" };
export const dynamic = "force-dynamic";

// O inventário tem o tamanho da empresa (dezenas de máquinas, não milhares):
// cabe inteiro numa tela, e paginar esconderia justamente a visão de mapa.
const LIMITE = 1000;

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseAssetFilters(params);
  const visao = params.visao === "lista" ? "lista" : "mapa";

  const ativos = { status: { not: "RETIRED" as const } };

  const [assets, teams, porStatus, termosPendentes, conferenciaVencida] = await Promise.all([
    prisma.asset.findMany({
      where: buildAssetWhere(filters),
      select: assetListSelect,
      orderBy: [{ tag: "asc" }],
      take: LIMITE,
    }),
    prisma.team.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.asset.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.responsibilityTerm.count({ where: { status: "PENDING" } }),
    prisma.asset.count({
      where: {
        ...ativos,
        OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: checkOverdueSince() } }],
      },
    }),
  ]);

  const contagem = Object.fromEntries(porStatus.map((g) => [g.status, g._count._all])) as Partial<
    Record<keyof typeof assetStatusLabels, number>
  >;
  const totalAtivos = (contagem.IN_USE ?? 0) + (contagem.IN_STOCK ?? 0) + (contagem.MAINTENANCE ?? 0);
  const filtrando = Boolean(
    filters.q || filters.type || filters.status || filters.teamId || filters.pendency,
  );

  const query = filtersToQuery(filters);
  const hrefVisao = (v: "mapa" | "lista") => {
    const q = new URLSearchParams(query);
    if (v === "lista") q.set("visao", "lista");
    const s = q.toString();
    return `/inventario${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventário"
        description={
          totalAtivos > 0
            ? `${totalAtivos} ${totalAtivos === 1 ? "equipamento ativo" : "equipamentos ativos"}`
            : undefined
        }
        action={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/inventario/termo">
                <FileText />
                Modelo do termo
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/inventario/novo">
                <Plus />
                Cadastrar
              </Link>
            </Button>
          </>
        }
      />

      {/* Indicadores clicáveis: cada número é também o atalho para a lista
          que ele conta, que é a próxima coisa que alguém quer ver. */}
      <div className="grid grid-cols-2 divide-x divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-6 lg:border-x">
        <Indicador href="/inventario" label="Ativos" value={totalAtivos} emphasis />
        <Indicador href="/inventario?status=IN_USE" label="Em uso" value={contagem.IN_USE ?? 0} />
        <Indicador href="/inventario?status=IN_STOCK" label="Em estoque" value={contagem.IN_STOCK ?? 0} />
        <Indicador
          href="/inventario?status=MAINTENANCE"
          label="Em manutenção"
          value={contagem.MAINTENANCE ?? 0}
          tone={(contagem.MAINTENANCE ?? 0) > 0 ? "warning" : "muted"}
        />
        <Indicador
          href="/inventario?pendencia=termo"
          label="Termos a assinar"
          value={termosPendentes}
          tone={termosPendentes > 0 ? "warning" : "muted"}
        />
        <Indicador
          href="/inventario?pendencia=conferencia"
          label="Conferência vencida"
          value={conferenciaVencida}
          tone={conferenciaVencida > 0 ? "warning" : "muted"}
          hint="há mais de 6 meses"
        />
      </div>

      <form action="/inventario" method="get" className="flex flex-wrap gap-2">
        {visao === "lista" && <input type="hidden" name="visao" value="lista" />}
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
          <Input
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="Patrimônio, nome, série, IP, pessoa…"
            className="pl-8"
            aria-label="Buscar equipamentos"
          />
        </div>
        <Select name="tipo" defaultValue={filters.type ?? ""} aria-label="Tipo" className="w-auto min-w-[8.5rem]">
          <option value="">Todos os tipos</option>
          {assetTypeOrder.map((t) => (
            <option key={t} value={t}>
              {assetTypeLabels[t]}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={filters.status ?? ""} aria-label="Situação" className="w-auto min-w-[8.5rem]">
          <option value="">Ativos</option>
          {assetStatusOrder.map((s) => (
            <option key={s} value={s}>
              {assetStatusLabels[s]}
            </option>
          ))}
          <option value="todos">Todos, com baixados</option>
        </Select>
        <Select name="setor" defaultValue={filters.teamId ? String(filters.teamId) : ""} aria-label="Setor" className="w-auto min-w-[8.5rem]">
          <option value="">Todos os setores</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
          <option value="nenhum">Sem setor</option>
        </Select>
        <Select name="pendencia" defaultValue={filters.pendency ?? ""} aria-label="Pendência" className="w-auto min-w-[8.5rem]">
          <option value="">Qualquer pendência</option>
          {(Object.keys(pendencyLabels) as Pendency[]).map((p) => (
            <option key={p} value={p}>
              {pendencyLabels[p]}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary" size="sm" className="h-9">
          Filtrar
        </Button>
        {filtrando && (
          <Button asChild variant="ghost" size="sm" className="h-9">
            <Link href={visao === "lista" ? "/inventario?visao=lista" : "/inventario"}>Limpar</Link>
          </Button>
        )}
      </form>

      <div className="flex items-center justify-between gap-3">
        <div className="flex rounded-md border border-border p-0.5" role="tablist" aria-label="Visão">
          <VisaoLink href={hrefVisao("mapa")} ativo={visao === "mapa"} icon={LayoutGrid} label="Mapa por setor" />
          <VisaoLink href={hrefVisao("lista")} ativo={visao === "lista"} icon={List} label="Lista" />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-muted-foreground">
            {assets.length} {assets.length === 1 ? "equipamento" : "equipamentos"}
          </span>
          <Button asChild variant="ghost" size="sm">
            <a href={`/api/inventario/exportar${query.size ? `?${query}` : ""}`}>
              <Download />
              Planilha
            </a>
          </Button>
        </div>
      </div>

      {assets.length === 0 ? (
        <EmptyState
          icon={MonitorSmartphone}
          title={filtrando ? "Nenhum equipamento com esses filtros." : "Nenhum equipamento cadastrado ainda."}
          description={
            filtrando
              ? undefined
              : "Comece pelo celular: abra o cadastro diante da máquina, tire a foto e preencha o que está na etiqueta."
          }
          action={
            !filtrando && (
              <Button asChild size="sm">
                <Link href="/inventario/novo">
                  <Plus />
                  Cadastrar o primeiro
                </Link>
              </Button>
            )
          }
        />
      ) : visao === "mapa" ? (
        <Mapa assets={assets} filters={filters} />
      ) : (
        <Lista assets={assets} />
      )}
    </div>
  );
}

function Indicador({
  href,
  label,
  value,
  hint,
  tone = "default",
  emphasis = false,
}: {
  href: string;
  label: string;
  value: number;
  hint?: string;
  tone?: "default" | "warning" | "muted";
  emphasis?: boolean;
}) {
  return (
    <Link href={href} className="px-3.5 py-2.5 transition-colors hover:bg-surface-muted/60">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-subtle-foreground">{label}</p>
      <p
        className={cn(
          "tabular mt-1 font-semibold leading-none tracking-tight",
          emphasis ? "text-[24px]" : "text-[20px]",
          { default: "text-foreground", warning: "text-warning", muted: "text-muted-foreground" }[tone],
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] leading-tight text-subtle-foreground">{hint}</p>}
    </Link>
  );
}

function VisaoLink({
  href,
  ativo,
  icon: Icon,
  label,
}: {
  href: string;
  ativo: boolean;
  icon: typeof LayoutGrid;
  label: string;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={ativo}
      className={cn(
        "flex items-center gap-1.5 rounded px-2.5 py-1 text-[12px] transition-colors",
        ativo
          ? "bg-primary-subtle font-medium text-primary-subtle-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </Link>
  );
}

/**
 * Mapa: os equipamentos agrupados pelo setor onde estão. É a visão de quem
 * anda pela empresa fazendo o levantamento — "no Financeiro, falta cadastrar
 * o quê?" — e a que mostra de relance onde se concentram as pendências.
 */
function Mapa({ assets, filters }: { assets: AssetListItem[]; filters: AssetFilters }) {
  const grupos = new Map<string, { nome: string; teamId: number | null; itens: AssetListItem[] }>();
  for (const a of assets) {
    const chave = a.team ? String(a.team.id) : "sem";
    if (!grupos.has(chave)) {
      grupos.set(chave, { nome: a.team?.name ?? "Sem setor", teamId: a.team?.id ?? null, itens: [] });
    }
    grupos.get(chave)!.itens.push(a);
  }
  // Setores em ordem alfabética; "Sem setor" por último, porque é pendência.
  const ordenados = [...grupos.values()].sort((a, b) =>
    a.teamId === null ? 1 : b.teamId === null ? -1 : a.nome.localeCompare(b.nome, "pt-BR"),
  );

  return (
    <div className="space-y-8">
      {ordenados.map((g) => {
        const pendentes = g.itens.filter(
          (a) => a.terms[0]?.status === "PENDING" || (a.assignee && !a.terms[0]),
        ).length;
        const pessoas = new Set(g.itens.map((a) => a.assignee?.id).filter(Boolean)).size;
        const linkSetor = new URLSearchParams(filtersToQuery(filters));
        linkSetor.set("setor", g.teamId ? String(g.teamId) : "nenhum");

        return (
          <Section
            key={g.nome}
            title={
              <Link href={`/inventario?${linkSetor}`} className="hover:text-foreground">
                {g.nome}
              </Link>
            }
            action={
              <span className="flex items-center gap-3 text-[11px] text-subtle-foreground">
                <span>
                  {g.itens.length} {g.itens.length === 1 ? "item" : "itens"}
                </span>
                {pessoas > 0 && (
                  <span>
                    {pessoas} {pessoas === 1 ? "pessoa" : "pessoas"}
                  </span>
                )}
                {pendentes > 0 && (
                  <span className="font-medium text-warning">
                    {pendentes} {pendentes === 1 ? "termo pendente" : "termos pendentes"}
                  </span>
                )}
              </span>
            }
          >
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {g.itens.map((a) => (
                <AssetCard key={a.id} asset={a} />
              ))}
            </div>
          </Section>
        );
      })}
    </div>
  );
}

function Lista({ assets }: { assets: AssetListItem[] }) {
  return (
    <Table className="min-w-[52rem]">
      <thead>
        <tr>
          <Th>Patrimônio</Th>
          <Th>Equipamento</Th>
          <Th>Responsável</Th>
          <Th>Setor · local</Th>
          <Th>Situação</Th>
          <Th>Termo</Th>
          <Th className="text-right">Conferido</Th>
        </tr>
      </thead>
      <tbody>
        {assets.map((a) => {
          const termo = a.terms[0];
          const vencida = a.status !== "RETIRED" && isCheckOverdue(a.lastCheckedAt);
          return (
            <Tr key={a.id}>
              <Td>
                <Link href={`/inventario/${a.id}`} className="font-mono text-[12px] font-medium hover:text-primary">
                  {a.tag}
                </Link>
              </Td>
              <Td>
                <Link href={`/inventario/${a.id}`} className="flex items-center gap-2 hover:text-primary">
                  <AssetTypeIcon type={a.type} className="size-4 shrink-0 text-subtle-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{assetName(a)}</span>
                    <span className="block truncate text-[11px] text-subtle-foreground">
                      {assetTypeLabels[a.type]}
                      {a.brand || a.model ? ` · ${[a.brand, a.model].filter(Boolean).join(" ")}` : ""}
                    </span>
                  </span>
                </Link>
              </Td>
              <Td>
                {a.assignee ? (
                  <span className="flex items-center gap-2">
                    <Avatar name={a.assignee.name} id={a.assignee.id} size="sm" />
                    <span className="truncate">{a.assignee.name}</span>
                  </span>
                ) : (
                  <span className="text-subtle-foreground">—</span>
                )}
              </Td>
              <Td className="text-muted-foreground">
                {[a.team?.name, a.location].filter(Boolean).join(" · ") || "—"}
              </Td>
              <Td>
                <AssetStatusBadge status={a.status} />
              </Td>
              <Td>
                {termo ? (
                  <TermStatusBadge status={termo.status} />
                ) : a.assignee ? (
                  <span className="text-[12px] text-warning">Sem termo</span>
                ) : (
                  <span className="text-subtle-foreground">—</span>
                )}
              </Td>
              <Td className={cn("text-right text-[12px]", vencida ? "text-warning" : "text-subtle-foreground")}>
                {a.lastCheckedAt ? formatRelative(a.lastCheckedAt) : "nunca"}
              </Td>
            </Tr>
          );
        })}
      </tbody>
    </Table>
  );
}
