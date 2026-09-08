import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Inbox } from "lucide-react";
import { Pagination } from "@/components/tickets/pagination";
import { TicketRow } from "@/components/tickets/ticket-row";
import { ProjectStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Section, Stat, StatStrip } from "@/components/ui/section";
import { formatDate, formatMinutes, formatRelative } from "@/lib/format";
import { getProject, getProjectMetrics } from "@/lib/project-queries";
import { requireAdmin } from "@/lib/session";
import { listTickets } from "@/lib/ticket-queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const project = await getProject(Number(id) || 0);
  return { title: project ? `${project.key} — ${project.name}` : "Projeto" };
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireAdmin();
  const { id } = await params;
  const query = await searchParams;

  const projectId = Number(id);
  if (!Number.isInteger(projectId) || projectId <= 0) notFound();

  const project = await getProject(projectId);
  if (!project) notFound();

  const showAll = query.tudo === "1";

  const [metrics, tickets] = await Promise.all([
    getProjectMetrics(projectId),
    listTickets(user, {
      projectId,
      onlyOpen: !showAll,
      page: Number(query.pagina) || 1,
    }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/projetos"
          className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Voltar para projetos
        </Link>

        <PageHeader
          title={project.name}
          description={project.description ?? undefined}
          action={<ProjectStatusBadge status={project.status} />}
        />

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="font-mono tracking-wide">{project.key}</span>
          {project.team && (
            <>
              <span aria-hidden>·</span>
              <span>{project.team.name}</span>
            </>
          )}
          {project.owner && (
            <>
              <span aria-hidden>·</span>
              <span>responsável: {project.owner.name}</span>
            </>
          )}
          {project.dueAt && (
            <>
              <span aria-hidden>·</span>
              <span>prazo {formatDate(project.dueAt)}</span>
            </>
          )}
        </div>
      </div>

      <StatStrip>
        <Stat label="Demandas" value={metrics.total} />
        <Stat label="Em aberto" value={metrics.open} emphasis />
        <Stat
          label="Entregues"
          value={metrics.done}
          tone={metrics.done > 0 ? "success" : "default"}
          emphasis
        />
        <Stat
          label="Fora do prazo"
          value={metrics.overdue}
          tone={metrics.overdue > 0 ? "danger" : "muted"}
        />
        <Stat
          label="Por entrega"
          value={formatMinutes(metrics.avgResolutionMinutes)}
          hint="média"
        />
        <Stat
          label="Apontado"
          value={formatMinutes(metrics.loggedMinutes || null)}
          hint="horas lançadas"
        />
      </StatStrip>

      {metrics.oldestOpenAt && (
        <p className="text-xs text-muted-foreground">
          A demanda mais antiga em aberto está parada desde{" "}
          <span className="text-foreground">{formatRelative(metrics.oldestOpenAt)}</span>.
        </p>
      )}

      <div className="flex gap-2">
        <Button asChild variant={showAll ? "ghost" : "secondary"} size="sm">
          <Link href={`/projetos/${projectId}`}>Em aberto</Link>
        </Button>
        <Button asChild variant={showAll ? "secondary" : "ghost"} size="sm">
          <Link href={`/projetos/${projectId}?tudo=1`}>Todas</Link>
        </Button>
      </div>

      <Section title={showAll ? "Todas as demandas" : "Demandas em aberto"}>
        {tickets.items.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={showAll ? "Nenhuma demanda neste projeto." : "Nada em aberto."}
            description="Demandas aparecem aqui quando alguém abre um chamado vinculado a este projeto."
          />
        ) : (
          <>
            <ul>
              {tickets.items.map((ticket) => (
                <TicketRow key={ticket.id} ticket={ticket} />
              ))}
            </ul>
            <div className="border-t border-border">
              <Pagination
                basePath={`/projetos/${projectId}`}
                page={tickets.page}
                pageCount={tickets.pageCount}
                total={tickets.total}
                params={query}
              />
            </div>
          </>
        )}
      </Section>
    </div>
  );
}
