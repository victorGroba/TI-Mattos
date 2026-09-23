import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeft,
  ArrowRightLeft,
  Camera,
  CheckCircle2,
  CircleDot,
  ClipboardCheck,
  FilePlus2,
  FileSignature,
  FileX2,
  ImageMinus,
  Pencil,
  PlusCircle,
  Trash2,
  Undo2,
  UserRound,
} from "lucide-react";
import {
  assignAssetAction,
  deletePhotoAction,
  markCheckedAction,
  reissueTermAction,
} from "@/app/(app)/inventario/actions";
import {
  AssetCover,
  AssetStatusBadge,
  TermStatusBadge,
  photoUrl,
} from "@/components/inventory/asset-visuals";
import { ConfirmSubmit } from "@/components/inventory/client-buttons";
import { PhotoUploader } from "@/components/inventory/photo-uploader";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Avatar, PageHeader } from "@/components/ui/misc";
import { Panel, Section } from "@/components/ui/section";
import type { AssetEventType } from "@/generated/prisma/enums";
import { formatDate, formatDateTime, formatRelative } from "@/lib/format";
import { assetName, isCheckOverdue } from "@/lib/inventory";
import { assetStatusLabels, assetTypeLabels } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/inventario/[id]">): Promise<Metadata> {
  const { id } = await params;
  const asset = await prisma.asset.findUnique({
    where: { id: Number(id) || 0 },
    select: { tag: true },
  });
  return { title: asset?.tag ?? "Equipamento" };
}

export default async function AssetPage({ params, searchParams }: PageProps<"/inventario/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const assetId = Number(id);
  if (!Number.isInteger(assetId) || assetId <= 0) notFound();

  const [asset, users] = await Promise.all([
    prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        team: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true, team: { select: { name: true } } } },
        photos: { orderBy: { createdAt: "asc" }, select: { id: true, filename: true } },
        events: {
          orderBy: { createdAt: "desc" },
          take: 100,
          include: { actor: { select: { id: true, name: true } } },
        },
        terms: {
          orderBy: { issuedAt: "desc" },
          select: {
            id: true,
            status: true,
            issuedAt: true,
            signedAt: true,
            closedAt: true,
            user: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { active: true, email: { not: "integracao@sistema.local" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!asset) notFound();

  const nome = assetName(asset);
  const [capa, ...demais] = asset.photos;
  const termoVigente = asset.terms.find((t) => t.status === "PENDING" || t.status === "SIGNED");
  const conferenciaVencida = asset.status !== "RETIRED" && isCheckOverdue(asset.lastCheckedAt);
  const garantiaVencida = asset.warrantyUntil ? asset.warrantyUntil < new Date() : false;
  const recusadas = Number(sp.recusadas) || 0;

  const identificacao: Array<[string, string | null, boolean?]> = [
    ["Tipo", assetTypeLabels[asset.type]],
    ["Marca", asset.brand],
    ["Modelo", asset.model],
    ["Nome na rede", asset.hostname, true],
    ["Nº de série", asset.serialNumber, true],
  ];
  const configuracao: Array<[string, string | null, boolean?]> = [
    ["Processador", asset.processor],
    ["Memória", asset.memory],
    ["Armazenamento", asset.storage],
    ["Sistema", asset.operatingSystem],
    ["IP", asset.ipAddress, true],
    ["MAC", asset.macAddress, true],
    ["Acesso remoto", asset.remoteAccess, true],
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href="/inventario"
          className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Inventário
        </Link>
        <PageHeader
          title={nome}
          description={`${asset.tag} · ${assetTypeLabels[asset.type]}`}
          action={
            <>
              <form action={markCheckedAction}>
                <input type="hidden" name="id" value={asset.id} />
                <Button type="submit" variant="secondary" size="sm" title="Registrar que a máquina foi vista no lugar hoje">
                  <ClipboardCheck />
                  Conferido
                </Button>
              </form>
              <Button asChild size="sm">
                <Link href={`/inventario/${asset.id}/editar`}>
                  <Pencil />
                  Editar
                </Link>
              </Button>
            </>
          }
        />
      </div>

      {sp.novo === "1" && (
        <p className="flex items-start gap-2 rounded-md bg-success-subtle px-3 py-2 text-[13px] text-success">
          <CheckCircle2 className="mt-px size-4 shrink-0" />
          <span>
            Equipamento cadastrado como <strong className="font-mono">{asset.tag}</strong>.
            {asset.assignee && ` O termo foi enviado para ${asset.assignee.name} assinar.`}
          </span>
        </p>
      )}
      {recusadas > 0 && (
        <p className="rounded-md bg-warning-subtle px-3 py-2 text-[13px] text-warning">
          {recusadas === 1 ? "Uma foto foi recusada" : `${recusadas} fotos foram recusadas`} (formato
          ou tamanho). Tente de novo pelo botão “Tirar foto”.
        </p>
      )}

      <div className="grid gap-x-8 gap-y-7 lg:grid-cols-[1fr_18rem]">
        <div className="min-w-0 space-y-7">
          <Section title={`Fotos (${asset.photos.length})`} action={<PhotoUploader assetId={asset.id} />} bodyClassName="pt-1">
            {capa ? (
              <div className="space-y-2">
                <a
                  href={photoUrl(capa.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block overflow-hidden rounded-lg border border-border"
                >
                  <AssetCover type={asset.type} photoId={capa.id} alt={nome} className="max-h-[26rem] w-full" />
                </a>
                {demais.length > 0 && (
                  <ul className="flex flex-wrap gap-2">
                    {demais.map((f) => (
                      <li key={f.id} className="group relative">
                        <a
                          href={photoUrl(f.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block overflow-hidden rounded-md border border-border hover:border-primary"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={photoUrl(f.id)} alt={f.filename} loading="lazy" className="size-24 object-cover" />
                        </a>
                        <form action={deletePhotoAction} className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100 max-lg:opacity-100">
                          <input type="hidden" name="photoId" value={f.id} />
                          <ConfirmSubmit
                            message="Apagar esta foto?"
                            variant="ghost"
                            size="icon"
                            className="size-6 rounded-full bg-black/60 text-white hover:bg-danger hover:text-white [&_svg]:size-3"
                            aria-label="Apagar foto"
                          >
                            <Trash2 />
                          </ConfirmSubmit>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}
                <form action={deletePhotoAction}>
                  <input type="hidden" name="photoId" value={capa.id} />
                  <ConfirmSubmit
                    message="Apagar a foto de capa? A próxima foto passa a ser a capa."
                    variant="link"
                    size="sm"
                    className="h-auto px-0 text-[11px] text-subtle-foreground hover:text-danger"
                  >
                    Apagar a capa
                  </ConfirmSubmit>
                </form>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border-strong px-6 py-10 text-center">
                <Camera className="mb-2 size-6 text-subtle-foreground" />
                <p className="text-[13px] font-medium text-foreground">Sem foto ainda</p>
                <p className="mt-1 max-w-xs text-[12px] text-muted-foreground">
                  Uma foto de frente e outra da etiqueta de série bastam para reconhecer a máquina
                  sem ir até ela.
                </p>
              </div>
            )}
          </Section>

          <Section title="Identificação e configuração">
            <div className="grid gap-x-8 sm:grid-cols-2">
              <Dados itens={identificacao} />
              <Dados itens={configuracao} vazio="Sem configuração registrada." />
            </div>
          </Section>

          {asset.notes && (
            <Section title="Observações">
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-foreground">{asset.notes}</p>
            </Section>
          )}

          <Section title="Histórico">
            <ol className="space-y-0">
              {asset.events.map((e) => {
                const { icon: Icon, texto } = descreverEvento(e);
                return (
                  <li key={e.id} className="relative flex gap-3 pb-3 pl-0.5 last:pb-0">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-muted text-muted-foreground">
                      <Icon className="size-3" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] leading-snug text-foreground">{texto}</p>
                      {e.note && e.type === "CHECKED" && (
                        <p className="text-[12px] text-muted-foreground">{e.note}</p>
                      )}
                      <p className="text-[11px] text-subtle-foreground" title={formatDateTime(e.createdAt)}>
                        {formatRelative(e.createdAt)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Section>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <Section title="Responsável">
            {asset.assignee ? (
              <div className="space-y-3">
                <Link href={`/admin/usuarios/${asset.assignee.id}`} className="flex items-center gap-2.5 hover:text-primary">
                  <Avatar name={asset.assignee.name} id={asset.assignee.id} />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium">{asset.assignee.name}</span>
                    <span className="block truncate text-[12px] text-muted-foreground">
                      {asset.assignee.team?.name ?? asset.assignee.email}
                    </span>
                  </span>
                </Link>

                {termoVigente ? (
                  <Panel className="space-y-2 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <TermStatusBadge status={termoVigente.status} />
                      <Link href={`/termos/${termoVigente.id}`} className="text-[12px] text-primary hover:underline">
                        Ver termo
                      </Link>
                    </div>
                    <p className="text-[12px] text-muted-foreground">
                      {termoVigente.status === "SIGNED"
                        ? `Assinado em ${formatDateTime(termoVigente.signedAt)}`
                        : `Enviado ${formatRelative(termoVigente.issuedAt)}. A pessoa recebeu o aviso no sistema e por e-mail.`}
                    </p>
                  </Panel>
                ) : (
                  <p className="rounded-md bg-warning-subtle px-3 py-2 text-[12px] text-warning">
                    Está com {asset.assignee.name.split(" ")[0]}, mas sem termo emitido.
                  </p>
                )}

                <form action={reissueTermAction}>
                  <input type="hidden" name="id" value={asset.id} />
                  <ConfirmSubmit
                    message={
                      termoVigente
                        ? "Emitir um termo novo? O atual é encerrado e a pessoa precisará assinar de novo."
                        : "Emitir o termo de responsabilidade para esta pessoa assinar?"
                    }
                    variant={termoVigente ? "ghost" : "primary"}
                    size="sm"
                    className={cn(termoVigente && "h-auto px-0 text-[12px]")}
                  >
                    <FileSignature />
                    {termoVigente ? "Reemitir termo" : "Emitir termo"}
                  </ConfirmSubmit>
                </form>
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                Ninguém. {asset.status === "RETIRED" ? "Equipamento baixado." : "Disponível para entrega."}
              </p>
            )}

            <form action={assignAssetAction} className="mt-4 space-y-2 border-t border-border pt-3">
              <input type="hidden" name="id" value={asset.id} />
              <label htmlFor="assigneeId" className="text-xs font-medium text-muted-foreground">
                {asset.assignee ? "Passar para outra pessoa" : "Entregar para"}
              </label>
              <div className="flex gap-2">
                <Select id="assigneeId" name="assigneeId" defaultValue="" required className="min-w-0 flex-1">
                  <option value="" disabled>
                    Escolha…
                  </option>
                  {users
                    .filter((u) => u.id !== asset.assigneeId)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </Select>
                <Button type="submit" size="sm" variant="secondary" className="h-9">
                  Entregar
                </Button>
              </div>
              <p className="text-[11px] text-subtle-foreground">Gera o termo para a pessoa assinar.</p>
            </form>

            {asset.assignee && (
              <form action={assignAssetAction} className="mt-2">
                <input type="hidden" name="id" value={asset.id} />
                <input type="hidden" name="assigneeId" value="" />
                <ConfirmSubmit
                  message={`Registrar a devolução por ${asset.assignee.name}? O termo atual é encerrado e a máquina volta ao estoque.`}
                  variant="ghost"
                  size="sm"
                  className="h-auto px-0 text-[12px]"
                >
                  <Undo2 />
                  Registrar devolução
                </ConfirmSubmit>
              </form>
            )}
          </Section>

          <Section title="Situação">
            <dl className="text-[13px]">
              <Linha rotulo="Situação">
                <AssetStatusBadge status={asset.status} />
              </Linha>
              <Linha rotulo="Setor">{asset.team?.name ?? "—"}</Linha>
              <Linha rotulo="Local">{asset.location ?? "—"}</Linha>
              <Linha rotulo="Conferido">
                <span className={cn(conferenciaVencida && "text-warning")} title={formatDateTime(asset.lastCheckedAt)}>
                  {asset.lastCheckedAt ? formatRelative(asset.lastCheckedAt) : "nunca"}
                </span>
              </Linha>
            </dl>
          </Section>

          {(asset.purchasedAt || asset.warrantyUntil) && (
            <Section title="Aquisição">
              <dl className="text-[13px]">
                <Linha rotulo="Compra">{formatDate(asset.purchasedAt)}</Linha>
                <Linha rotulo="Garantia">
                  <span className={cn(garantiaVencida && "text-subtle-foreground line-through")}>
                    {formatDate(asset.warrantyUntil)}
                  </span>
                  {garantiaVencida && <span className="ml-1.5 text-[11px] text-subtle-foreground">vencida</span>}
                </Linha>
              </dl>
            </Section>
          )}

          {asset.terms.length > 0 && (
            <Section title={`Termos (${asset.terms.length})`}>
              <ul className="space-y-1.5">
                {asset.terms.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/termos/${t.id}`}
                      className="flex items-center justify-between gap-2 rounded px-1.5 py-1 -mx-1.5 transition-colors hover:bg-surface-muted"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] text-foreground">{t.user.name}</span>
                        <span className="block text-[11px] text-subtle-foreground">
                          {formatDate(t.signedAt ?? t.issuedAt)}
                          {t.closedAt && ` → ${formatDate(t.closedAt)}`}
                        </span>
                      </span>
                      <TermStatusBadge status={t.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </aside>
      </div>
    </div>
  );
}

function Dados({
  itens,
  vazio,
}: {
  itens: Array<[string, string | null, boolean?]>;
  vazio?: string;
}) {
  const preenchidos = itens.filter(([, v]) => v);
  if (preenchidos.length === 0) {
    return vazio ? <p className="py-1.5 text-[13px] text-subtle-foreground">{vazio}</p> : null;
  }
  return (
    <dl className="text-[13px]">
      {preenchidos.map(([rotulo, valor, mono]) => (
        <Linha key={rotulo} rotulo={rotulo}>
          {/* select-all: um toque seleciona o valor inteiro — é o que se faz
              com número de série e ID de acesso remoto. */}
          <span className={cn("select-all", mono && "font-mono text-[12px]")}>{valor}</span>
        </Linha>
      ))}
    </dl>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-1.5 last:border-b-0">
      <dt className="shrink-0 text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0 text-right text-foreground [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function descreverEvento(e: {
  type: AssetEventType;
  fromValue: string | null;
  toValue: string | null;
  note: string | null;
  actor: { name: string } | null;
}): { icon: typeof CircleDot; texto: string } {
  const quem = e.actor?.name ?? "Sistema";
  switch (e.type) {
    case "CREATED":
      return { icon: PlusCircle, texto: `${quem} cadastrou o equipamento` };
    case "UPDATED":
      return { icon: Pencil, texto: `${quem} alterou ${e.note ?? "o cadastro"}` };
    case "ASSIGNED":
      return { icon: UserRound, texto: `${quem} entregou para ${e.toValue ?? "—"}` };
    case "RETURNED":
      return { icon: Undo2, texto: `${quem} registrou a devolução por ${e.fromValue ?? "—"}` };
    case "STATUS_CHANGED":
      return {
        icon: ArrowRightLeft,
        texto: `${quem} mudou a situação para ${assetStatusLabels[e.toValue as never] ?? e.toValue}`,
      };
    case "CHECKED":
      return { icon: ClipboardCheck, texto: `${quem} conferiu o equipamento no lugar` };
    case "PHOTO_ADDED":
      return {
        icon: Camera,
        texto: `${quem} adicionou ${e.toValue && e.toValue !== "1" ? `${e.toValue} fotos` : "uma foto"}`,
      };
    case "PHOTO_REMOVED":
      return { icon: ImageMinus, texto: `${quem} apagou uma foto` };
    case "TERM_ISSUED":
      return { icon: FilePlus2, texto: `Termo emitido para ${e.toValue ?? "—"}` };
    case "TERM_SIGNED":
      return { icon: FileSignature, texto: `${e.toValue ?? quem} assinou o termo` };
    case "TERM_CANCELLED":
      return { icon: FileX2, texto: `Termo de ${e.fromValue ?? "—"} cancelado antes da assinatura` };
    default:
      return { icon: CircleDot, texto: quem };
  }
}
