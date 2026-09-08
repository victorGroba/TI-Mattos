import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

// A unidade de agrupamento do sistema.
//
// Substitui o cartão com borda e sombra em quase todo lugar. Quando tudo é uma
// caixa branca flutuando, nada tem mais peso que nada e a tela vira um mosaico
// sem hierarquia. Um rótulo pequeno em versalete sobre uma régua fina separa
// tão bem quanto uma moldura, ocupa menos espaço e deixa o dado — que é o que
// a pessoa veio ver — como o elemento mais forte da tela.
//
// A moldura fica reservada para o que é de fato um objeto destacado: um
// formulário, um comentário, um aviso.

export function Section({
  title,
  action,
  className,
  bodyClassName,
  children,
}: {
  title: ReactNode;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("min-w-0", className)}>
      <div className="mb-3 flex h-6 items-center justify-between gap-3 border-b border-border pb-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
          {title}
        </h2>
        {action}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Bloco com moldura — só para objetos destacados (formulários, avisos). */
export function Panel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-lg border border-border bg-surface", className)}
      {...props}
    />
  );
}

/**
 * Faixa de indicadores. Um único bloco dividido por réguas, em vez de N
 * cartões soltos: os números pertencem à mesma leitura, então formam uma linha
 * só — e o mais importante ganha destaque de tamanho, não de moldura.
 */
export function StatStrip({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-6 lg:border-x">
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
  emphasis = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "warning" | "danger" | "success" | "muted";
  /** Reserva o tamanho maior para o número que define a leitura da tela. */
  emphasis?: boolean;
}) {
  const toneClass = {
    default: "text-foreground",
    muted: "text-muted-foreground",
    warning: "text-warning",
    danger: "text-danger",
    success: "text-success",
  }[tone];

  return (
    <div className="px-3.5 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-subtle-foreground">
        {label}
      </p>
      <p
        className={cn(
          "tabular mt-1 font-semibold leading-none tracking-tight",
          emphasis ? "text-[24px]" : "text-[20px]",
          toneClass,
        )}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-[11px] leading-tight text-subtle-foreground">{hint}</p>
      )}
    </div>
  );
}
