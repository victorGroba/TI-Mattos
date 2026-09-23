import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AssetForm } from "@/components/inventory/asset-form";
import { PageHeader } from "@/components/ui/misc";
import { getAssetFormOptions, toDateInput } from "@/lib/asset-queries";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Editar equipamento" };
export const dynamic = "force-dynamic";

export default async function EditAssetPage({ params }: PageProps<"/inventario/[id]/editar">) {
  const { id } = await params;
  const assetId = Number(id);
  if (!Number.isInteger(assetId) || assetId <= 0) notFound();

  const [asset, options] = await Promise.all([
    prisma.asset.findUnique({ where: { id: assetId } }),
    getAssetFormOptions(),
  ]);
  if (!asset) notFound();

  // Uma conta desativada continua aparecendo como responsável atual, senão o
  // select a mostraria vazia e salvar sem mexer tiraria a máquina dela.
  if (asset.assigneeId && !options.users.some((u) => u.id === asset.assigneeId)) {
    const atual = await prisma.user.findUnique({
      where: { id: asset.assigneeId },
      select: { id: true, name: true, teamId: true },
    });
    if (atual) options.users.push({ ...atual, name: `${atual.name} (inativo)` });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title={`Editar ${asset.tag}`} />
      <AssetForm
        options={options}
        values={{
          ...asset,
          purchasedAt: toDateInput(asset.purchasedAt),
          warrantyUntil: toDateInput(asset.warrantyUntil),
        }}
      />
    </div>
  );
}
