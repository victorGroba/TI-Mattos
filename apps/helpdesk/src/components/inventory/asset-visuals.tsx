import {
  Laptop,
  type LucideIcon,
  Monitor,
  Package,
  PcCase,
  Printer,
  Router,
  Smartphone,
  Tablet,
} from "lucide-react";
import type { AssetStatus, AssetType, TermStatus } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import {
  assetStatusLabels,
  assetStatusTones,
  assetTypeLabels,
  termStatusLabels,
  termStatusTones,
} from "@/lib/labels";
import { cn } from "@/lib/utils";

// Peças visuais do inventário, compartilhadas entre a grade, a lista, o
// detalhe e a área do colaborador — o mesmo equipamento precisa ter a mesma
// cara em todas elas.

export const assetTypeIcons: Record<AssetType, LucideIcon> = {
  DESKTOP: PcCase,
  NOTEBOOK: Laptop,
  MONITOR: Monitor,
  PRINTER: Printer,
  PHONE: Smartphone,
  TABLET: Tablet,
  NETWORK: Router,
  OTHER: Package,
};

export function AssetTypeIcon({ type, className }: { type: AssetType; className?: string }) {
  const Icon = assetTypeIcons[type];
  return <Icon className={className} aria-label={assetTypeLabels[type]} />;
}

export function AssetStatusBadge({ status }: { status: AssetStatus }) {
  return <Badge tone={assetStatusTones[status]}>{assetStatusLabels[status]}</Badge>;
}

export function TermStatusBadge({ status }: { status: TermStatus }) {
  return <Badge tone={termStatusTones[status]}>{termStatusLabels[status]}</Badge>;
}

export function photoUrl(photoId: number): string {
  return `/api/inventario/fotos/${photoId}`;
}

/**
 * Capa do equipamento: a primeira foto ou, sem foto, o ícone do tipo sobre
 * um fundo neutro. A caixa tem sempre a mesma proporção, para a grade não
 * ficar desalinhada entre máquinas com e sem foto.
 */
export function AssetCover({
  type,
  photoId,
  alt,
  className,
  iconClassName,
}: {
  type: AssetType;
  photoId?: number | null;
  alt: string;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-surface-muted",
        className,
      )}
    >
      {photoId ? (
        // <img> e não next/image: a foto é privada e servida por rota
        // autenticada, que o otimizador de imagens não consegue ler.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl(photoId)}
          alt={alt}
          loading="lazy"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <AssetTypeIcon
          type={type}
          className={cn("size-10 text-subtle-foreground/70", iconClassName)}
        />
      )}
    </div>
  );
}
