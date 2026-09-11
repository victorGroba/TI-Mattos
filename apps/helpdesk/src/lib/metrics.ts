import type { Priority, TicketStatus, TicketType } from "@/generated/prisma/enums";
import { prisma } from "./prisma";
import { activeStatuses } from "./labels";

// Consultas de leitura do painel e dos relatórios.
//
// Tudo aqui lê os campos denormalizados do Ticket (resolutionMinutes,
// firstResponseMinutes, slaResolutionBreached) e os TicketStatusPeriod, que o
// serviço de tickets mantém na escrita. Nenhuma métrica reconstrói histórico
// em tempo de consulta — é o que permite o painel abrir rápido mesmo com anos
// de chamados.

export interface MetricsFilter {
  /** Início do recorte. Chamados criados a partir daqui. */
  from: Date;
  to: Date;
  teamId?: number;
  type?: TicketType;
  projectId?: number;
}

/** Arquivados ficam fora de toda métrica — é o objetivo do arquivamento. */
const ATIVO = { archivedAt: null } as const;

function periodWhere(filter: MetricsFilter) {
  return {
    ...ATIVO,
    createdAt: { gte: filter.from, lte: filter.to },
    ...(filter.teamId ? { teamId: filter.teamId } : {}),
    ...(filter.type ? { type: filter.type } : {}),
    ...(filter.projectId ? { projectId: filter.projectId } : {}),
  };
}

export interface Overview {
  /** Em aberto agora — independe do recorte de datas. */
  backlog: number;
  backlogOverdue: number;
  unassigned: number;
  createdInPeriod: number;
  resolvedInPeriod: number;
  avgFirstResponseMinutes: number | null;
  avgResolutionMinutes: number | null;
  medianResolutionMinutes: number | null;
  /** Fração de 0 a 1 dos resolvidos no período que cumpriram o SLA. */
  slaCompliance: number | null;
  reopenRate: number | null;
}

export async function getOverview(filter: MetricsFilter): Promise<Overview> {
  const scope = {
    ...ATIVO,
    ...(filter.teamId ? { teamId: filter.teamId } : {}),
    ...(filter.type ? { type: filter.type } : {}),
    ...(filter.projectId ? { projectId: filter.projectId } : {}),
  };

  const [
    backlog,
    backlogOverdue,
    unassigned,
    createdInPeriod,
    resolvedAgg,
    responseAgg,
    breached,
    reopened,
  ] = await Promise.all([
    prisma.ticket.count({ where: { ...scope, status: { in: activeStatuses } } }),
    prisma.ticket.count({
      where: { ...scope, status: { in: activeStatuses }, slaResolutionBreached: true },
    }),
    prisma.ticket.count({
      where: { ...scope, status: { in: activeStatuses }, assigneeId: null },
    }),
    prisma.ticket.count({ where: periodWhere(filter) }),

    // Resolvidos são contados pela data de resolução, não de criação: a
    // pergunta "quanto entregamos em setembro" é sobre a entrega.
    prisma.ticket.aggregate({
      where: { ...scope, resolvedAt: { gte: filter.from, lte: filter.to } },
      _count: { _all: true },
      _avg: { resolutionMinutes: true },
    }),
    prisma.ticket.aggregate({
      where: { ...scope, firstResponseAt: { gte: filter.from, lte: filter.to } },
      _avg: { firstResponseMinutes: true },
    }),
    prisma.ticket.count({
      where: {
        ...scope,
        resolvedAt: { gte: filter.from, lte: filter.to },
        slaResolutionBreached: true,
      },
    }),
    prisma.ticket.count({
      where: {
        ...scope,
        resolvedAt: { gte: filter.from, lte: filter.to },
        reopenCount: { gt: 0 },
      },
    }),
  ]);

  const resolvedInPeriod = resolvedAgg._count._all;

  return {
    backlog,
    backlogOverdue,
    unassigned,
    createdInPeriod,
    resolvedInPeriod,
    avgFirstResponseMinutes: round(responseAgg._avg.firstResponseMinutes),
    avgResolutionMinutes: round(resolvedAgg._avg.resolutionMinutes),
    medianResolutionMinutes: await getMedianResolution(filter),
    slaCompliance: resolvedInPeriod > 0 ? 1 - breached / resolvedInPeriod : null,
    reopenRate: resolvedInPeriod > 0 ? reopened / resolvedInPeriod : null,
  };
}

/**
 * Mediana em vez de só a média: um único chamado esquecido por três meses
 * distorce a média e faz a operação parecer pior do que é. As duas juntas
 * contam a história completa.
 */
async function getMedianResolution(filter: MetricsFilter): Promise<number | null> {
  const rows = await prisma.ticket.findMany({
    where: {
      ...ATIVO,
      resolvedAt: { gte: filter.from, lte: filter.to },
      resolutionMinutes: { not: null },
      ...(filter.teamId ? { teamId: filter.teamId } : {}),
      ...(filter.type ? { type: filter.type } : {}),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
    },
    select: { resolutionMinutes: true },
    orderBy: { resolutionMinutes: "asc" },
  });

  if (rows.length === 0) return null;
  const mid = Math.floor(rows.length / 2);
  if (rows.length % 2 === 1) return rows[mid].resolutionMinutes;
  return Math.round(
    ((rows[mid - 1].resolutionMinutes ?? 0) + (rows[mid].resolutionMinutes ?? 0)) / 2,
  );
}

function round(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : Math.round(value);
}

// ---------- Distribuições ----------

export async function getBacklogByStatus(filter: MetricsFilter) {
  const rows = await prisma.ticket.groupBy({
    by: ["status"],
    where: {
      ...ATIVO,
      status: { in: activeStatuses },
      ...(filter.teamId ? { teamId: filter.teamId } : {}),
      ...(filter.type ? { type: filter.type } : {}),
    },
    _count: { _all: true },
  });

  return rows.map((r) => ({ status: r.status as TicketStatus, count: r._count._all }));
}

export async function getBacklogByPriority(filter: MetricsFilter) {
  const rows = await prisma.ticket.groupBy({
    by: ["priority"],
    where: {
      ...ATIVO,
      status: { in: activeStatuses },
      ...(filter.teamId ? { teamId: filter.teamId } : {}),
    },
    _count: { _all: true },
  });

  return rows.map((r) => ({ priority: r.priority as Priority, count: r._count._all }));
}

/** Carga e desempenho por setor — a visão que responde "onde está o gargalo". */
export async function getTeamPerformance(filter: MetricsFilter) {
  const [teams, open, resolved] = await Promise.all([
    prisma.team.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.ticket.groupBy({
      by: ["teamId"],
      where: { ...ATIVO, status: { in: activeStatuses } },
      _count: { _all: true },
    }),
    prisma.ticket.groupBy({
      by: ["teamId"],
      where: { ...ATIVO, resolvedAt: { gte: filter.from, lte: filter.to } },
      _count: { _all: true },
      _avg: { resolutionMinutes: true },
    }),
  ]);

  const openBy = new Map(open.map((r) => [r.teamId, r._count._all]));
  const resolvedBy = new Map(
    resolved.map((r) => [r.teamId, { count: r._count._all, avg: r._avg.resolutionMinutes }]),
  );

  return teams
    .map((team) => ({
      id: team.id,
      name: team.name,
      open: openBy.get(team.id) ?? 0,
      resolved: resolvedBy.get(team.id)?.count ?? 0,
      avgResolutionMinutes: round(resolvedBy.get(team.id)?.avg),
    }))
    // Setores sem nenhum movimento só poluiriam a tabela.
    .filter((t) => t.open > 0 || t.resolved > 0)
    .sort((a, b) => b.open - a.open || b.resolved - a.resolved);
}

/** Criados x resolvidos por dia — mostra se a fila está crescendo ou drenando. */
export async function getThroughput(filter: MetricsFilter) {
  const scope = filter.teamId ? { teamId: filter.teamId } : {};

  const [created, resolved] = await Promise.all([
    prisma.ticket.findMany({
      where: { ...ATIVO, ...scope, createdAt: { gte: filter.from, lte: filter.to } },
      select: { createdAt: true },
    }),
    prisma.ticket.findMany({
      where: { ...ATIVO, ...scope, resolvedAt: { gte: filter.from, lte: filter.to } },
      select: { resolvedAt: true },
    }),
  ]);

  const buckets = new Map<string, { created: number; resolved: number }>();
  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

  // Pré-preenche todos os dias do intervalo: um dia sem movimento precisa
  // aparecer como zero, senão o gráfico "pula" e distorce a leitura.
  for (let t = filter.from.getTime(); t <= filter.to.getTime(); t += 86_400_000) {
    buckets.set(dayKey(new Date(t)), { created: 0, resolved: 0 });
  }

  for (const t of created) {
    const b = buckets.get(dayKey(t.createdAt));
    if (b) b.created += 1;
  }
  for (const t of resolved) {
    if (!t.resolvedAt) continue;
    const b = buckets.get(dayKey(t.resolvedAt));
    if (b) b.resolved += 1;
  }

  return [...buckets.entries()]
    .map(([day, counts]) => ({ day, ...counts }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * Tempo médio em cada status. É o número que aponta *onde* o tempo é perdido —
 * fila de triagem, execução ou espera pelo solicitante.
 */
export async function getTimeByStatus(filter: MetricsFilter) {
  const rows = await prisma.ticketStatusPeriod.groupBy({
    by: ["status"],
    where: {
      endedAt: { not: null },
      startedAt: { gte: filter.from, lte: filter.to },
      ticket: {
        ...ATIVO,
        ...(filter.teamId ? { teamId: filter.teamId } : {}),
      },
    },
    _avg: { businessMinutes: true },
    _sum: { businessMinutes: true },
    _count: { _all: true },
  });

  return rows
    .map((r) => ({
      status: r.status as TicketStatus,
      avgMinutes: round(r._avg.businessMinutes),
      totalMinutes: r._sum.businessMinutes ?? 0,
      samples: r._count._all,
    }))
    .sort((a, b) => (b.avgMinutes ?? 0) - (a.avgMinutes ?? 0));
}

/** Chamados abertos há mais tempo — a fila que ninguém está olhando. */
export async function getOldestOpen(limit = 5, teamId?: number) {
  return prisma.ticket.findMany({
    where: {
      ...ATIVO,
      status: { in: activeStatuses },
      ...(teamId ? { teamId } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      type: true,
      createdAt: true,
      resolutionDueAt: true,
      slaResolutionBreached: true,
      team: { select: { name: true } },
      assignee: { select: { id: true, name: true } },
    },
  });
}

/** Carteira por atendente: quanto cada um segura e quanto entregou. */
export async function getAgentWorkload(filter: MetricsFilter) {
  const [open, resolved] = await Promise.all([
    prisma.ticket.groupBy({
      by: ["assigneeId"],
      where: { ...ATIVO, status: { in: activeStatuses }, assigneeId: { not: null } },
      _count: { _all: true },
    }),
    prisma.ticket.groupBy({
      by: ["assigneeId"],
      where: {
        ...ATIVO,
        resolvedAt: { gte: filter.from, lte: filter.to },
        assigneeId: { not: null },
      },
      _count: { _all: true },
      _avg: { resolutionMinutes: true },
    }),
  ]);

  const ids = [
    ...new Set([...open, ...resolved].map((r) => r.assigneeId).filter((id): id is number => id !== null)),
  ];
  if (ids.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });

  const openBy = new Map(open.map((r) => [r.assigneeId, r._count._all]));
  const resolvedBy = new Map(
    resolved.map((r) => [r.assigneeId, { count: r._count._all, avg: r._avg.resolutionMinutes }]),
  );

  return users
    .map((u) => ({
      id: u.id,
      name: u.name,
      open: openBy.get(u.id) ?? 0,
      resolved: resolvedBy.get(u.id)?.count ?? 0,
      avgResolutionMinutes: round(resolvedBy.get(u.id)?.avg),
    }))
    .sort((a, b) => b.open - a.open || b.resolved - a.resolved);
}
