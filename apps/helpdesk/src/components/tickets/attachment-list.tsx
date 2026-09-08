import { Download, FileText } from "lucide-react";
import { humanSize, isImage } from "@/lib/uploads";
import { cn } from "@/lib/utils";

// Exibição de anexos já salvos.
//
// Imagem vira miniatura clicável: num helpdesk a maioria dos anexos é print de
// tela, e o atendente precisa ver o erro sem baixar arquivo por arquivo. O
// resto vira linha com nome e tamanho.
//
// A `src` aponta para /api/anexos/[id], que revalida a permissão a cada
// requisição — os arquivos não ficam numa pasta pública.

export interface AttachmentItem {
  id: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export function AttachmentList({
  itens,
  compacto = false,
}: {
  itens: AttachmentItem[];
  compacto?: boolean;
}) {
  if (itens.length === 0) return null;

  const imagens = itens.filter((a) => isImage(a.mimeType));
  const arquivos = itens.filter((a) => !isImage(a.mimeType));

  return (
    <div className="space-y-2">
      {imagens.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {imagens.map((a) => (
            <li key={a.id}>
              <a
                href={`/api/anexos/${a.id}`}
                target="_blank"
                rel="noopener noreferrer"
                title={`${a.filename} · ${humanSize(a.sizeBytes)}`}
                className="block overflow-hidden rounded-md border border-border transition-colors hover:border-primary"
              >
                {/* <img> e não next/image: o arquivo é privado e servido por
                    uma rota autenticada, que o otimizador não consegue ler. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/anexos/${a.id}`}
                  alt={a.filename}
                  loading="lazy"
                  className={cn(
                    "object-cover",
                    compacto ? "size-16" : "size-24",
                  )}
                />
              </a>
            </li>
          ))}
        </ul>
      )}

      {arquivos.length > 0 && (
        <ul className="space-y-1">
          {arquivos.map((a) => (
            <li key={a.id}>
              <a
                href={`/api/anexos/${a.id}`}
                className="group flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 transition-colors hover:border-border-strong"
              >
                <FileText className="size-4 shrink-0 text-subtle-foreground" />
                <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">
                  {a.filename}
                </span>
                <span className="shrink-0 text-[11px] text-subtle-foreground">
                  {humanSize(a.sizeBytes)}
                </span>
                <Download className="size-3.5 shrink-0 text-subtle-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
