import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Paginação preservando os filtros da URL. Recebe os searchParams atuais em
 * vez de reconstruí-los, para que trocar de página nunca descarte um filtro.
 */
export function Pagination({
  basePath,
  page,
  pageCount,
  total,
  params,
}: {
  basePath: string;
  page: number;
  pageCount: number;
  total: number;
  params: Record<string, string | undefined>;
}) {
  if (pageCount <= 1) {
    return (
      <p className="px-4 py-3 text-xs text-subtle-foreground">
        {total} {total === 1 ? "chamado" : "chamados"}
      </p>
    );
  }

  const hrefFor = (target: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
    search.set("pagina", String(target));
    return `${basePath}?${search.toString()}`;
  };

  const linkClass =
    "flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs transition-colors hover:bg-surface-muted";

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <p className="text-xs text-subtle-foreground">
        Página <span className="tabular">{page}</span> de{" "}
        <span className="tabular">{pageCount}</span> · {total}{" "}
        {total === 1 ? "chamado" : "chamados"}
      </p>

      <div className="flex items-center gap-1.5">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={linkClass}>
            <ChevronLeft className="size-3.5" />
            Anterior
          </Link>
        ) : (
          <span className={cn(linkClass, "cursor-not-allowed opacity-40")}>
            <ChevronLeft className="size-3.5" />
            Anterior
          </span>
        )}

        {page < pageCount ? (
          <Link href={hrefFor(page + 1)} className={linkClass}>
            Próxima
            <ChevronRight className="size-3.5" />
          </Link>
        ) : (
          <span className={cn(linkClass, "cursor-not-allowed opacity-40")}>
            Próxima
            <ChevronRight className="size-3.5" />
          </span>
        )}
      </div>
    </div>
  );
}
