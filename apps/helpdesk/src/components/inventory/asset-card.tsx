import Link from "next/link";
import { FileWarning, MapPin } from "lucide-react";
import { Avatar } from "@/components/ui/misc";
import type { AssetListItem } from "@/lib/asset-queries";
import { assetName, isCheckOverdue, specsSummary } from "@/lib/inventory";
import { assetTypeLabels } from "@/lib/labels";
import { AssetCover, AssetStatusBadge } from "./asset-visuals";

// Cartão da grade do inventário.
//
// Responde de relance às três perguntas de quem está fazendo o mapeamento:
// que máquina é (foto, nome, configuração), com quem está (responsável) e se
// falta alguma coisa (termo sem assinatura, conferência vencida).

export function AssetCard({ asset }: { asset: AssetListItem }) {
  const nome = assetName(asset);
  const specs = specsSummary(asset);
  const termo = asset.terms[0];
  const termoPendente = termo?.status === "PENDING";
  const semTermo = Boolean(asset.assignee) && !termo;
  const conferenciaVencida = asset.status !== "RETIRED" && isCheckOverdue(asset.lastCheckedAt);

  return (
    <Link
      href={`/inventario/${asset.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-[var(--shadow-raised)]"
    >
      <div className="relative">
        <AssetCover type={asset.type} photoId={asset.photos[0]?.id} alt={nome} />
        <span className="absolute left-2 top-2">
          <AssetStatusBadge status={asset.status} />
        </span>
        <span className="font-mono absolute bottom-2 right-2 rounded bg-black/55 px-1.5 py-px text-[11px] font-medium text-white backdrop-blur-sm">
          {asset.tag}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-subtle-foreground">
            {assetTypeLabels[asset.type]}
          </p>
          <p className="truncate text-[14px] font-semibold text-foreground group-hover:text-primary">
            {nome}
          </p>
          {specs && <p className="truncate text-[12px] text-muted-foreground">{specs}</p>}
        </div>

        {asset.location && (
          <p className="flex items-center gap-1 truncate text-[12px] text-muted-foreground">
            <MapPin className="size-3 shrink-0" />
            <span className="truncate">{asset.location}</span>
          </p>
        )}

        <div className="mt-auto flex items-center gap-2 border-t border-border pt-2">
          {asset.assignee ? (
            <>
              <Avatar name={asset.assignee.name} id={asset.assignee.id} size="sm" />
              <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">
                {asset.assignee.name}
              </span>
            </>
          ) : (
            <span className="flex-1 text-[12px] text-subtle-foreground">Sem responsável</span>
          )}

          {(termoPendente || semTermo) && (
            <span
              className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-warning"
              title={termoPendente ? "Termo aguardando assinatura" : "Sem termo emitido"}
            >
              <FileWarning className="size-3.5" />
              {termoPendente ? "Termo" : "Sem termo"}
            </span>
          )}
          {!termoPendente && !semTermo && conferenciaVencida && (
            <span
              className="size-1.5 shrink-0 rounded-full bg-warning"
              title="Conferência vencida"
              aria-label="Conferência vencida"
            />
          )}
        </div>
      </div>
    </Link>
  );
}
