import type { ReactNode } from "react";

// Lista de barras horizontais em HTML puro — sem biblioteca de gráfico.
//
// A barra é uma régua fina na base da linha, não um retângulo atrás do texto:
// preenchimento de largura total lê como botão clicável e disputa atenção com
// o próprio dado. Como régua, a proporção entra pela periferia da visão e a
// leitura principal continua sendo "rótulo → número".

export interface BarItem {
  label: ReactNode;
  value: number;
  /** Texto secundário à direita — contagem de amostras, percentual, etc. */
  meta?: string;
  href?: string;
}

export function BarList({
  items,
  emptyLabel = "Nada por aqui.",
  formatValue = (v: number) => String(v),
}: {
  items: BarItem[];
  emptyLabel?: string;
  formatValue?: (value: number) => string;
}) {
  if (items.length === 0) {
    return <p className="py-3 text-[13px] text-muted-foreground">{emptyLabel}</p>;
  }

  // Escala relativa ao maior valor: comparar entre si é a única pergunta que
  // esta lista responde.
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <ul>
      {items.map((item, index) => {
        const pct = Math.max((item.value / max) * 100, 2);

        const row = (
          <div className="relative pb-[5px] pt-1.5">
            <div className="flex items-baseline gap-3">
              <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                {item.label}
              </span>
              {item.meta && (
                <span className="shrink-0 text-[11px] text-subtle-foreground">
                  {item.meta}
                </span>
              )}
              <span className="tabular shrink-0 text-[13px] font-medium text-foreground">
                {formatValue(item.value)}
              </span>
            </div>

            {/* Trilho completo em cinza + preenchimento proporcional. Os dois
                juntos deixam claro que a escala é relativa ao maior valor. */}
            <div className="mt-1.5 h-[3px] w-full rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );

        return (
          <li key={index}>
            {item.href ? (
              <a
                href={item.href}
                className="-mx-1.5 block rounded px-1.5 transition-colors hover:bg-surface-muted/60"
              >
                {row}
              </a>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ul>
  );
}
