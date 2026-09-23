import Link from "next/link";
import type { Metadata } from "next";
import { FileSignature, Laptop, LifeBuoy, MapPin } from "lucide-react";
import { AssetCover, TermStatusBadge } from "@/components/inventory/asset-visuals";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Section } from "@/components/ui/section";
import { formatDate } from "@/lib/format";
import { assetName, specsSummary } from "@/lib/inventory";
import { assetTypeLabels } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Meus equipamentos" };
export const dynamic = "force-dynamic";

// O que está no nome da pessoa, e o que falta ela assinar.
//
// O termo pendente vem primeiro e em destaque: é a única ação que esta tela
// pede, e o motivo pelo qual a pessoa chegou aqui pelo aviso.

export default async function MyAssetsPage() {
  const user = await requireUser("/meus-equipamentos");

  const [assets, pendentes] = await Promise.all([
    prisma.asset.findMany({
      where: { assigneeId: user.id, status: { not: "RETIRED" } },
      select: {
        id: true,
        tag: true,
        type: true,
        hostname: true,
        brand: true,
        model: true,
        serialNumber: true,
        processor: true,
        memory: true,
        storage: true,
        operatingSystem: true,
        location: true,
        team: { select: { name: true } },
        photos: { select: { id: true }, orderBy: { createdAt: "asc" }, take: 1 },
        terms: {
          where: { userId: user.id, status: { in: ["PENDING", "SIGNED"] } },
          select: { id: true, status: true, signedAt: true, issuedAt: true },
          orderBy: { issuedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { tag: "asc" },
    }),
    prisma.responsibilityTerm.findMany({
      where: { userId: user.id, status: "PENDING" },
      select: { id: true, asset: { select: { tag: true, type: true, hostname: true, brand: true, model: true } } },
      orderBy: { issuedAt: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meus equipamentos"
        description={
          assets.length > 0
            ? `${assets.length} ${assets.length === 1 ? "equipamento no seu nome" : "equipamentos no seu nome"}`
            : undefined
        }
      />

      {pendentes.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning-subtle p-4">
          <div className="flex items-start gap-3">
            <FileSignature className="mt-0.5 size-5 shrink-0 text-warning" />
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="text-[14px] font-semibold text-foreground">
                  {pendentes.length === 1
                    ? "Você tem um termo de responsabilidade para assinar"
                    : `Você tem ${pendentes.length} termos de responsabilidade para assinar`}
                </p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  Confira o equipamento e assine — leva menos de um minuto.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {pendentes.map((t) => (
                  <Button key={t.id} asChild size="sm">
                    <Link href={`/termos/${t.id}`}>
                      Assinar · {assetTypeLabels[t.asset.type]} {t.asset.tag}
                    </Link>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <Section title="No seu nome">
        {assets.length === 0 ? (
          <EmptyState
            icon={Laptop}
            title="Nenhum equipamento registrado no seu nome."
            description="Se você usa uma máquina da empresa e ela não aparece aqui, avise a TI por um chamado."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {assets.map((a) => {
              const nome = assetName(a);
              const specs = specsSummary(a);
              const termo = a.terms[0];
              return (
                <article key={a.id} className="flex overflow-hidden rounded-lg border border-border bg-surface">
                  <AssetCover
                    type={a.type}
                    photoId={a.photos[0]?.id}
                    alt={nome}
                    className="w-32 shrink-0 self-stretch sm:w-40"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-2 p-3.5">
                    <div className="min-w-0">
                      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-subtle-foreground">
                        {assetTypeLabels[a.type]} · <span className="font-mono">{a.tag}</span>
                      </p>
                      <p className="truncate text-[15px] font-semibold text-foreground">{nome}</p>
                      {specs && <p className="text-[12px] leading-snug text-muted-foreground">{specs}</p>}
                      {a.serialNumber && (
                        <p className="mt-0.5 text-[11px] text-subtle-foreground">
                          Série <span className="font-mono">{a.serialNumber}</span>
                        </p>
                      )}
                    </div>

                    {(a.location || a.team) && (
                      <p className="flex items-center gap-1 text-[12px] text-muted-foreground">
                        <MapPin className="size-3 shrink-0" />
                        {[a.team?.name, a.location].filter(Boolean).join(" · ")}
                      </p>
                    )}

                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
                      {termo ? (
                        <Link href={`/termos/${termo.id}`} className="flex items-center gap-2 text-[12px] hover:underline">
                          <TermStatusBadge status={termo.status} />
                          {termo.status === "SIGNED" && (
                            <span className="text-subtle-foreground">em {formatDate(termo.signedAt)}</span>
                          )}
                        </Link>
                      ) : (
                        <span className="text-[12px] text-subtle-foreground">Sem termo</span>
                      )}
                      <Link
                        href="/chamados/novo"
                        className="flex items-center gap-1 text-[12px] text-primary hover:underline"
                      >
                        <LifeBuoy className="size-3.5" />
                        Problema com ele?
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
