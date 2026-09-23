import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Clock, ShieldCheck } from "lucide-react";
import { TermStatusBadge } from "@/components/inventory/asset-visuals";
import { PrintButton } from "@/components/inventory/client-buttons";
import { SignTermForm } from "@/components/inventory/sign-term-form";
import { formatDateTime } from "@/lib/format";
import { isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Termo de responsabilidade" };
export const dynamic = "force-dynamic";

// Um termo, para ler, assinar e imprimir.
//
// A mesma página serve às duas pontas: o colaborador assina aqui, a TI
// confere aqui, e os dois imprimem daqui. O texto exibido é sempre o gravado
// na emissão, nunca remontado a partir do cadastro atual da máquina.

export default async function TermPage({ params }: PageProps<"/termos/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const termId = Number(id);
  if (!Number.isInteger(termId) || termId <= 0) notFound();

  const term = await prisma.responsibilityTerm.findUnique({
    where: { id: termId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      issuedBy: { select: { name: true } },
      asset: { select: { id: true, tag: true } },
    },
  });

  // Só a pessoa do termo e a TI. Os demais recebem 404, como nos anexos.
  const admin = isAdmin(user.role);
  if (!term || (!admin && term.userId !== user.id)) notFound();

  const souEu = term.userId === user.id;
  const pendente = term.status === "PENDING";
  const encerrado = term.status === "CANCELLED" || term.status === "RETURNED";

  return (
    <div className="mx-auto max-w-3xl space-y-5 print:max-w-none">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={admin ? `/inventario/${term.asset.id}` : "/meus-equipamentos"}
          className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {admin ? term.asset.tag : "Meus equipamentos"}
        </Link>
        <div className="flex items-center gap-2">
          <TermStatusBadge status={term.status} />
          {!pendente && <PrintButton />}
        </div>
      </div>

      {encerrado && (
        <p className="rounded-md bg-neutral-subtle px-3 py-2 text-[13px] text-neutral print:hidden">
          {term.status === "CANCELLED"
            ? "Este termo foi cancelado antes da assinatura e não tem validade."
            : `Termo encerrado em ${formatDateTime(term.closedAt)}, com a devolução ou a substituição do equipamento. Fica guardado como registro do período.`}
        </p>
      )}

      {pendente && souEu && (
        <p className="flex items-start gap-2 rounded-md bg-info-subtle px-3 py-2.5 text-[13px] leading-relaxed text-info print:hidden">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          Leia com atenção. No fim da página, marque que concorda e assine no quadro — com o dedo,
          no celular, ou com o mouse.
        </p>
      )}

      {/* A folha: fundo e tinta fixos, iguais nos dois temas e na impressão. */}
      <article className="rounded-lg border border-border bg-white px-6 py-8 text-[#1b262b] shadow-[var(--shadow-card)] sm:px-10 sm:py-10 print:border-0 print:p-0 print:shadow-none">
        <div className="whitespace-pre-wrap text-[14px] leading-[1.75] [&::first-line]:font-semibold [&::first-line]:tracking-wide">
          {term.body}
        </div>

        {term.signedAt && term.signatureImage && (
          <div className="mt-10 border-t border-[#dfe5e7] pt-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={term.signatureImage}
              alt={`Assinatura de ${term.user.name}`}
              className="h-24 w-auto max-w-full object-contain"
            />
            <div className="mt-1 w-72 max-w-full border-t border-[#1b262b] pt-1.5">
              <p className="text-[13px] font-semibold">{term.user.name}</p>
              <p className="text-[12px] text-[#5f7278]">{term.user.email}</p>
            </div>

            <dl className="mt-6 grid gap-x-6 gap-y-1 text-[11px] text-[#5f7278] sm:grid-cols-2">
              <div>
                <dt className="inline">Assinado eletronicamente em </dt>
                <dd className="inline font-medium text-[#1b262b]">{formatDateTime(term.signedAt)}</dd>
              </div>
              {term.signerIp && (
                <div>
                  <dt className="inline">IP: </dt>
                  <dd className="inline font-mono">{term.signerIp}</dd>
                </div>
              )}
              <div>
                <dt className="inline">Emitido em </dt>
                <dd className="inline">
                  {formatDateTime(term.issuedAt)}
                  {term.issuedBy && ` por ${term.issuedBy.name}`}
                </dd>
              </div>
              <div>
                <dt className="inline">Termo nº </dt>
                <dd className="inline font-mono">{term.id}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="inline">Código de verificação (SHA-256 do texto): </dt>
                <dd className="inline break-all font-mono">{term.bodyHash}</dd>
              </div>
            </dl>
          </div>
        )}
      </article>

      {pendente && souEu && (
        <section className="space-y-3 print:hidden">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
            Assinatura
          </h2>
          <SignTermForm termId={term.id} bodyHash={term.bodyHash} signerName={term.user.name} />
        </section>
      )}

      {pendente && !souEu && (
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground print:hidden">
          <Clock className="size-4" />
          Aguardando a assinatura de {term.user.name} desde {formatDateTime(term.issuedAt)}.
        </p>
      )}
    </div>
  );
}
