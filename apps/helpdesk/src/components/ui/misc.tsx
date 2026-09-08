import type { ComponentType, ReactNode } from "react";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Avatar por iniciais. A cor vem do id do usuário, então a mesma pessoa
 * aparece sempre com a mesma cor em qualquer tela — sem guardar nada.
 */
const avatarPalette = [
  "bg-info-subtle text-info",
  "bg-primary-subtle text-primary-subtle-foreground",
  "bg-accent-subtle text-accent",
  "bg-success-subtle text-success",
  "bg-warning-subtle text-warning",
  "bg-danger-subtle text-danger",
];

export function Avatar({
  name,
  id,
  size = "md",
  className,
}: {
  name: string;
  id?: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const tone = avatarPalette[(id ?? name.length) % avatarPalette.length];
  return (
    <span
      title={name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        size === "sm" ? "size-6 text-[10px]" : "size-7 text-[11px]",
        tone,
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/**
 * Cabeçalho de página. O título é o único texto grande da tela; a descrição
 * só existe quando diz algo que o título não diz — repetir a obviedade em
 * cinza embaixo de cada cabeçalho é o que faz uma interface parecer gerada.
 */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-baseline gap-3">
        <h1 className="text-[19px] font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description && (
          <p className="truncate text-[13px] text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {Icon && <Icon className="mb-2.5 size-5 text-subtle-foreground" />}
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
