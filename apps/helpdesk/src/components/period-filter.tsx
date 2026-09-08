import Link from "next/link";
import { cn } from "@/lib/utils";

// Recorte de tempo do painel e dos relatórios. É um grupo de links, não um
// <select>: o período fica na URL, então a visão é compartilhável por link e
// volta igual pelo botão de voltar do navegador.

export const PERIOD_OPTIONS = [
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
  { days: 365, label: "12 meses" },
] as const;

export const DEFAULT_PERIOD_DAYS = 30;

/** Lê e valida `?dias=`, caindo no padrão quando o valor não é uma opção. */
export function parsePeriod(value: string | undefined): number {
  const days = Number(value);
  return PERIOD_OPTIONS.some((o) => o.days === days) ? days : DEFAULT_PERIOD_DAYS;
}

export function periodRange(days: number): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  return { from, to };
}

export function PeriodFilter({
  basePath,
  current,
}: {
  basePath: string;
  current: number;
}) {
  return (
    <div className="inline-flex rounded-md border border-border bg-surface p-0.5">
      {PERIOD_OPTIONS.map((option) => {
        const active = option.days === current;
        return (
          <Link
            key={option.days}
            href={`${basePath}?dias=${option.days}`}
            aria-current={active ? "true" : undefined}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-primary-subtle text-primary-subtle-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
