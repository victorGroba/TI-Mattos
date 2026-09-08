import { prisma } from "./prisma";
import { activeStatuses } from "./labels";

// Consultas da área de projetos.
//
// Um projeto aqui é um agrupador de demandas (CHANGE_REQUEST / IMPROVEMENT /
// TASK). O que interessa em cada um é sempre a mesma pergunta: quanto já foi
// entregue, o que está parado, e em quanto tempo entregamos.

export interface ProjectSummary {
  id: number;
  name: string;
  key: string;
  status: string;
  dueAt: Date | null;
  owner: { id: number; name: string } | null;
  team: { id: number; name: string } | null;
  total: number;
  open: number;
  done: number;
  overdue: number;
  avgResolutionMinutes: number | null;
}

export async function listProjects(includeArchived = false): Promise<ProjectSummary[]> {
  const projects = await prisma.project.findMany({
    where: includeArchived ? {} : { status: { not: "ARCHIVED" } },
    include: {
      owner: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  if (projects.length === 0) return [];

  const ids = projects.map((p) => p.id);

  // Três agregações em vez de N+1 consultas por projeto: a lista precisa
  // continuar rápida quando houver dezenas de projetos.
  const [totals, open, resolved, overdue] = await Promise.all([
    prisma.ticket.groupBy({
      by: ["projectId"],
      where: { projectId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.ticket.groupBy({
      by: ["projectId"],
      where: { projectId: { in: ids }, status: { in: activeStatuses } },
      _count: { _all: true },
    }),
    prisma.ticket.groupBy({
      by: ["projectId"],
      where: { projectId: { in: ids }, status: { in: ["RESOLVED", "CLOSED"] } },
      _count: { _all: true },
      _avg: { resolutionMinutes: true },
    }),
    prisma.ticket.groupBy({
      by: ["projectId"],
      where: {
        projectId: { in: ids },
        status: { in: activeStatuses },
        slaResolutionBreached: true,
      },
      _count: { _all: true },
    }),
  ]);

  const totalBy = new Map(totals.map((r) => [r.projectId, r._count._all]));
  const openBy = new Map(open.map((r) => [r.projectId, r._count._all]));
  const doneBy = new Map(
    resolved.map((r) => [r.projectId, { count: r._count._all, avg: r._avg.resolutionMinutes }]),
  );
  const overdueBy = new Map(overdue.map((r) => [r.projectId, r._count._all]));

  return projects.map((p) => {
    const done = doneBy.get(p.id);
    return {
      id: p.id,
      name: p.name,
      key: p.key,
      status: p.status,
      dueAt: p.dueAt,
      owner: p.owner,
      team: p.team,
      total: totalBy.get(p.id) ?? 0,
      open: openBy.get(p.id) ?? 0,
      done: done?.count ?? 0,
      overdue: overdueBy.get(p.id) ?? 0,
      avgResolutionMinutes:
        done?.avg === null || done?.avg === undefined ? null : Math.round(done.avg),
    };
  });
}

export async function getProject(id: number) {
  return prisma.project.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      team: { select: { id: true, name: true } },
    },
  });
}

/** Números de entrega do projeto — o que responde "estamos no ritmo?". */
export async function getProjectMetrics(projectId: number) {
  const [total, open, resolved, overdue, oldest] = await Promise.all([
    prisma.ticket.count({ where: { projectId } }),
    prisma.ticket.count({ where: { projectId, status: { in: activeStatuses } } }),
    prisma.ticket.aggregate({
      where: { projectId, status: { in: ["RESOLVED", "CLOSED"] } },
      _count: { _all: true },
      _avg: { resolutionMinutes: true },
      _sum: { workingMinutes: true },
    }),
    prisma.ticket.count({
      where: { projectId, status: { in: activeStatuses }, slaResolutionBreached: true },
    }),
    prisma.ticket.findFirst({
      where: { projectId, status: { in: activeStatuses } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
  ]);

  const loggedMinutes = await prisma.timeEntry.aggregate({
    where: { ticket: { projectId } },
    _sum: { minutes: true },
  });

  return {
    total,
    open,
    done: resolved._count._all,
    overdue,
    avgResolutionMinutes:
      resolved._avg.resolutionMinutes === null
        ? null
        : Math.round(resolved._avg.resolutionMinutes),
    workingMinutes: resolved._sum.workingMinutes ?? 0,
    loggedMinutes: loggedMinutes._sum.minutes ?? 0,
    oldestOpenAt: oldest?.createdAt ?? null,
  };
}
