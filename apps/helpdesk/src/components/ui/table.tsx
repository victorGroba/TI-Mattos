import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// Tabela de dados densa. Linha de ~38px, cabeçalho em versalete pequeno,
// separador só entre linhas — sem zebra e sem borda externa, que só somam
// ruído quando a tabela já está dentro de uma seção delimitada.

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    // O wrapper rola sozinho na horizontal: uma tabela larga nunca pode
    // empurrar a página inteira para o lado no celular.
    <div className="-mx-1 overflow-x-auto px-1">
      <table className={cn("w-full min-w-[38rem] text-[13px]", className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "whitespace-nowrap px-3 pb-2 text-left text-[10px] font-medium uppercase tracking-[0.08em] text-subtle-foreground first:pl-0 last:pr-0",
        className,
      )}
      {...props}
    />
  );
}

export function Tr({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "border-t border-border transition-colors hover:bg-surface-muted/60",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return (
    <td
      className={cn(
        "px-3 py-2 align-middle text-foreground first:pl-0 last:pr-0",
        className,
      )}
      {...props}
    />
  );
}

/** Célula numérica: alinhada à direita e com dígitos de largura fixa. */
export function TdNum({ className, ...props }: ComponentProps<"td">) {
  return <Td className={cn("tabular text-right", className)} {...props} />;
}
