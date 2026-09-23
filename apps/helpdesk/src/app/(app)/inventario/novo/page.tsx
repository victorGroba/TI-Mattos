import type { Metadata } from "next";
import { AssetForm } from "@/components/inventory/asset-form";
import { PageHeader } from "@/components/ui/misc";
import { getAssetFormOptions } from "@/lib/asset-queries";

export const metadata: Metadata = { title: "Cadastrar equipamento" };
export const dynamic = "force-dynamic";

export default async function NewAssetPage() {
  const options = await getAssetFormOptions();

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Cadastrar equipamento" />
      <AssetForm options={options} />
    </div>
  );
}
