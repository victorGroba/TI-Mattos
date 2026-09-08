import Link from "next/link";
import type { Metadata } from "next";
import { BarList } from "@/components/charts/bar-list";
import { ThroughputChart } from "@/components/charts/throughput-chart";
import { PeriodFilter, parsePeriod, periodRange } from "@/components/period-filter";
import { PriorityBadge, StatusBadge } from "@/components/ui/badge";
import { Section, Stat, StatStrip } from "@/components/ui/section";
import { Table, Td, TdNum, Th, Tr } from "@/components/ui/table";
import { Avatar, EmptyState, PageHeader } from "@/components/ui/misc";
import { formatMinutes, formatPercent, formatRelative } from "@/lib/format";
import { statusLabels, statusOrder } from "@/lib/labels";
import {
  getBacklogByStatus,
  getOldestOpen,
  getOverview,
  getTeamPerformance,
  getThroughput,
  getTimeByStatus,
} from "@/lib/metrics";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Painel" };

// Consulta o banco a cada acesso: o painel é sobre o estado de agora, e
// qualquer cache faria alguém tomar decisão em cima de fila desatualizada.
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  await requireAdmin();

  const { dias } = await searchParams;
  const days = parsePeriod(dias);
  const filter = periodRange(days);

  const [overview, byStatus, timeByStatus, teams, throughput, oldest] =
    await Promise.all([
      getOverview(filter),
      getBacklogByStatus(filter),
      getTimeByStatus(filter),
      getTeamPerformance(filter),
      getThroughput(filter),
      getOldestOpen(6),
    ]);

  const statusItems = statusOrder
    .map((status) => ({
      status,
      count: byStatus.find((b) => b.status === status)?.count ?? 0,
    }))
    .filter((s) => s.count > 0)
    .map((s) => ({
      label: statusLabels[s.status],
      value: s.count,
      href: `/chamados?status=${s.status}`,
    }));

  const draining = overview.resolvedInPeriod >= overview.createdInPeriod;

  return (
    <div className="space-y-7">
      <PageHeader
        title="Painel"
        action={<PeriodFilter basePath="/" current={days} />}
      />

      {/* A fila em aberto é o número que decide o dia — por isso é o único
          com destaque de tamanho. */}
      <StatStrip>
        <Stat
          label="Em aberto"
          value={overview.backlog}
          emphasis
          hint={
            overview.unassigned > 0
              ? `${overview.unassigned} sem responsável`
              : "todos atribuídos"
          }
        />
        <Stat
          label="Fora do prazo"
          value={overview.backlogOverdue}
          tone={overview.backlogOverdue > 0 ? "danger" : "muted"}
          emphasis
        />
        <Stat label="Abertos" value={overview.createdInPeriod} hint={`${days} dias`} />
        <Stat
          label="Entregues"
          value={overview.resolvedInPeriod}
          tone={draining ? "success" : "default"}
          hint={draining ? "fila drenando" : "fila crescendo"}
        />
        <Stat
          label="1ª resposta"
          value={formatMinutes(overview.avgFirstResponseMinutes)}
          hint="média útil"
        />
        <Stat
          label="Entrega"
          value={formatMinutes(overview.medianResolutionMinutes)}
          hint={`mediana · méd ${formatMinutes(overview.avgResolutionMinutes)}`}
        />
      </StatStrip>

      <Section
        title="Entrada x saída"
        action={
          overview.slaCompliance !== null ? (
            <span className="text-[11px] text-subtle-foreground">
              SLA cumprido{" "}
              <span className="tabular font-medium text-foreground">
                {formatPercent(overview.slaCompliance)}
              </span>
            </span>
          ) : null
        }
      >
        <ThroughputChart data={throughput} />
      </Section>

      <div className="grid gap-x-8 gap-y-7 lg:grid-cols-3">
        <Section title="Fila por status">
          <BarList items={statusItems} emptyLabel="Nenhum chamado em aberto." />
        </Section>

        <Section title="Onde o tempo é gasto">
          <BarList
            items={timeByStatus
              .filter((t) => t.avgMinutes !== null)
              .map((t) => ({
                label: statusLabels[t.status],
                value: t.avgMinutes ?? 0,
                meta: `${t.samples}×`,
              }))}
            formatValue={formatMinutes}
            emptyLabel="Sem histórico no período."
          />
        </Section>

        <Section title="Por setor">
          {teams.length === 0 ? (
            <EmptyState title="Sem movimento no período." />
          ) : (
            <Table className="min-w-0">
              <thead>
                <tr>
                  <Th>Setor</Th>
                  <Th className="text-right">Fila</Th>
                  <Th className="text-right">Entregue</Th>
                  <Th className="text-right">Tempo</Th>
                </tr>
              </thead>
              <tbody>
                {teams.slice(0, 8).map((team) => (
                  <Tr key={team.id}>
                    <Td className="max-w-[9rem] truncate">
                      <Link
                        href={`/chamados?setor=${team.id}`}
                        className="hover:text-primary"
                      >
                        {team.name}
                      </Link>
                    </Td>
                    <TdNum>{team.open}</TdNum>
                    <TdNum className="text-muted-foreground">{team.resolved}</TdNum>
                    <TdNum className="text-muted-foreground">
                      {formatMinutes(team.avgResolutionMinutes)}
                    </TdNum>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Section>
      </div>

      <Section
        title="Esperando há mais tempo"
        action={
          <Link
            href="/chamados?status=abertos"
            className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            ver a fila →
          </Link>
        }
      >
        {oldest.length === 0 ? (
          <EmptyState title="Nenhum chamado em aberto." />
        ) : (
          <ul>
            {oldest.map((ticket) => (
              <li key={ticket.id} className="border-t border-border first:border-t-0">
                <Link
                  href={`/chamados/${ticket.id}`}
                  className="flex items-center gap-3 py-2 transition-colors hover:bg-surface-muted/60"
                >
                  <span className="tabular w-10 shrink-0 text-[11px] text-subtle-foreground">
                    {ticket.id}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                    {ticket.title}
                  </span>
                  <span className="hidden w-28 shrink-0 truncate text-[12px] text-subtle-foreground sm:block">
                    {ticket.team.name}
                  </span>
                  <span className="w-24 shrink-0 text-right text-[12px] text-subtle-foreground">
                    {formatRelative(ticket.createdAt)}
                  </span>
                  <span className="hidden shrink-0 items-center gap-1.5 md:flex">
                    <PriorityBadge priority={ticket.priority} />
                    <StatusBadge status={ticket.status} />
                  </span>
                  {ticket.assignee ? (
                    <Avatar
                      name={ticket.assignee.name}
                      id={ticket.assignee.id}
                      size="sm"
                    />
                  ) : (
                    <span className="size-6 shrink-0 rounded-full border border-dashed border-border-strong" />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
