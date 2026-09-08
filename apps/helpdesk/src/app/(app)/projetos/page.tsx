import Link from "next/link";
import type { Metadata } from "next";
import { FolderKanban } from "lucide-react";
import { ProjectStatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar, EmptyState, PageHeader } from "@/components/ui/misc";
import type { ProjectStatus } from "@/generated/prisma/enums";
import { formatDate, formatMinutes } from "@/lib/format";
import { listProjects } from "@/lib/project-queries";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Projetos" };
export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  await requireAdmin();
  const projects = await listProjects();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Projetos"
        description="Demandas de mudança agrupadas por frente de trabalho"
      />

      {projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={FolderKanban}
            title="Nenhum projeto cadastrado."
            description="Projetos agrupam demandas de mudança e melhoria, e é por eles que se mede o tempo de entrega por frente de trabalho."
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const progress = project.total > 0 ? project.done / project.total : 0;

            return (
              <Link
                key={project.id}
                href={`/projetos/${project.id}`}
                className="rounded-lg border border-border bg-surface p-4 shadow-[var(--shadow-card)] transition-colors hover:border-border-strong"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-mono text-[11px] tracking-wide text-subtle-foreground">
                      {project.key}
                    </span>
                    <h2 className="truncate text-sm font-semibold text-foreground">
                      {project.name}
                    </h2>
                  </div>
                  <ProjectStatusBadge status={project.status as ProjectStatus} />
                </div>

                <div className="mt-3.5">
                  <div className="mb-1 flex items-baseline justify-between text-xs">
                    <span className="text-muted-foreground">
                      <span className="tabular font-medium text-foreground">
                        {project.done}
                      </span>{" "}
                      de <span className="tabular">{project.total}</span> entregues
                    </span>
                    {project.overdue > 0 && (
                      <span className="tabular text-danger">
                        {project.overdue} fora do prazo
                      </span>
                    )}
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                  </div>
                </div>

                <dl className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <dt className="sr-only">Em aberto</dt>
                    <dd className="tabular">{project.open} em aberto</dd>
                  </div>
                  {project.avgResolutionMinutes !== null && (
                    <div className="flex items-center gap-1">
                      <dt className="sr-only">Tempo médio de entrega</dt>
                      <dd className="tabular">
                        {formatMinutes(project.avgResolutionMinutes)} por demanda
                      </dd>
                    </div>
                  )}
                  {project.dueAt && (
                    <div className="flex items-center gap-1">
                      <dt className="sr-only">Prazo</dt>
                      <dd className="tabular">até {formatDate(project.dueAt)}</dd>
                    </div>
                  )}
                </dl>

                {project.owner && (
                  <div className="mt-3 flex items-center gap-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
                    <Avatar name={project.owner.name} id={project.owner.id} size="sm" />
                    {project.owner.name}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
