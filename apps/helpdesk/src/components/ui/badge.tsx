import type { ReactNode } from "react";
import type { Priority, ProjectStatus, TicketStatus, TicketType } from "@/generated/prisma/enums";
import {
  priorityLabels,
  priorityTones,
  projectStatusLabels,
  projectStatusTones,
  slaLabels,
  slaTones,
  statusLabels,
  statusTones,
  toneClasses,
  typeLabels,
  typeTones,
  type Tone,
} from "@/lib/labels";
import type { SlaHealth } from "@/lib/sla";
import { cn } from "@/lib/utils";

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-px text-[11px] font-medium leading-5 whitespace-nowrap",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <Badge tone={statusTones[status]}>{statusLabels[status]}</Badge>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <Badge tone={priorityTones[priority]}>
      {/* Ponto colorido: a prioridade precisa ser legível de relance numa
          lista longa, antes mesmo de a pessoa ler o texto. */}
      <span className="size-1 rounded-full bg-current" aria-hidden />
      {priorityLabels[priority]}
    </Badge>
  );
}

export function TypeBadge({ type }: { type: TicketType }) {
  return <Badge tone={typeTones[type]}>{typeLabels[type]}</Badge>;
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <Badge tone={projectStatusTones[status]}>{projectStatusLabels[status]}</Badge>;
}

export function SlaBadge({ health }: { health: SlaHealth }) {
  if (health === "none") return null;
  return <Badge tone={slaTones[health]}>{slaLabels[health]}</Badge>;
}
