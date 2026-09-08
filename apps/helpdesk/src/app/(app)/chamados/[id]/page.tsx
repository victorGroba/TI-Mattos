import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, FolderKanban, UserRound } from "lucide-react";
import { ReplyForm } from "@/components/tickets/reply-form";
import { Timeline } from "@/components/tickets/timeline";
import { PriorityBadge, SlaBadge, StatusBadge, TypeBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Avatar } from "@/components/ui/misc";
import { Panel, Section } from "@/components/ui/section";
import { formatDateTime, formatMinutes, formatRelative } from "@/lib/format";
import { statusLabels, statusOrder } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { canViewTicket, isAdmin } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import { slaHealth } from "@/lib/sla";
import { getFormOptions, getTicketDetail } from "@/lib/ticket-queries";
import { AttachmentList } from "@/components/tickets/attachment-list";
import { assignAction, changeStatusAction, setProjectAction } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const ticket = await prisma.ticket.findUnique({
    where: { id: Number(id) || 0 },
    select: { title: true },
  });
  return { title: ticket ? `#${id} ${ticket.title}` : "Chamado" };
}

/** Linha rótulo/valor do painel lateral. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-border py-1.5 first:border-t-0">
      <span className="shrink-0 text-[12px] text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-[13px] text-foreground">{children}</span>
    </div>
  );
}

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ticketId = Number(id);
  if (!Number.isInteger(ticketId) || ticketId <= 0) notFound();

  const user = await requireUser(`/chamados/${id}`);
  const ticket = await getTicketDetail(ticketId);
  if (!ticket) notFound();

  const watcherIds = (
    await prisma.ticketWatcher.findMany({
      where: { ticketId },
      select: { userId: true },
    })
  ).map((w) => w.userId);

  if (!canViewTicket(user, { requesterId: ticket.requesterId, watcherIds })) {
    notFound();
  }

  const admin = isAdmin(user.role);
  const { agents, projects } = admin
    ? await getFormOptions()
    : { agents: [], projects: [] };

  const health = slaHealth(
    new Date(),
    ticket.createdAt,
    ticket.resolutionDueAt,
    ticket.slaResolutionBreached,
  );

  const totalLogged = ticket.timeEntries.reduce((sum, e) => sum + e.minutes, 0);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={admin ? "/chamados" : "/meus-chamados"}
          className="mb-2.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          Voltar
        </Link>

        <div className="flex items-start gap-2.5">
          <span className="tabular mt-[3px] shrink-0 text-[15px] font-medium text-subtle-foreground">
            {ticket.id}
          </span>
          <h1 className="min-w-0 flex-1 text-[19px] font-semibold leading-snug tracking-tight text-foreground">
            {ticket.title}
          </h1>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
          <TypeBadge type={ticket.type} />
          <SlaBadge health={health} />
          <span className="ml-1 text-[12px] text-subtle-foreground">
            {ticket.requester.name} · {formatRelative(ticket.createdAt)}
          </span>
        </div>
      </div>

      <div className="grid gap-x-8 gap-y-7 lg:grid-cols-[1fr_17rem]">
        <div className="min-w-0 space-y-7">
          <Section title="Descrição">
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
              {ticket.description}
            </p>
          </Section>

          {ticket.attachments.length > 0 && (
            <Section title={`Anexos (${ticket.attachments.length})`}>
              <AttachmentList itens={ticket.attachments} />
            </Section>
          )}

          <Section title="Movimentação">
            <Timeline ticket={ticket} canSeeInternal={admin} />
          </Section>

          <Section title="Responder">
            <ReplyForm ticketId={ticket.id} canPostInternal={admin} />
          </Section>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <Section title="Situação">
            <div className="space-y-2">
              <form action={changeStatusAction} className="flex gap-1.5">
                <input type="hidden" name="ticketId" value={ticket.id} />
                <Select
                  name="status"
                  defaultValue={ticket.status}
                  aria-label="Status do chamado"
                  className="h-8 text-[13px]"
                >
                  {(admin
                    ? statusOrder
                    : // Quem abriu só encerra ou reabre — o servidor recusa o resto.
                      ([ticket.status, "CLOSED", "OPEN"] as typeof statusOrder)
                  )
                    .filter((s, i, arr) => arr.indexOf(s) === i)
                    .map((status) => (
                      <option key={status} value={status}>
                        {statusLabels[status]}
                      </option>
                    ))}
                </Select>
                <Button type="submit" variant="secondary" size="sm" className="h-8 shrink-0">
                  Salvar
                </Button>
              </form>

              {admin && (
                <form action={assignAction} className="flex gap-1.5">
                  <input type="hidden" name="ticketId" value={ticket.id} />
                  <Select
                    name="assigneeId"
                    defaultValue={ticket.assigneeId ? String(ticket.assigneeId) : ""}
                    aria-label="Responsável"
                    className="h-8 text-[13px]"
                  >
                    <option value="">Sem responsável</option>
                    {ticket.assigneeId !== user.id && (
                      <option value="eu">Atribuir a mim</option>
                    )}
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    className="h-8 shrink-0"
                    aria-label="Definir responsável"
                  >
                    <UserRound />
                  </Button>
                </form>
              )}

              {/* Vincular a um projeto é decisão de triagem: o solicitante
                  descreve o que precisa, e quem atende decide se aquilo é
                  suporte ou demanda de uma frente de trabalho. */}
              {admin && projects.length > 0 && (
                <form action={setProjectAction} className="flex gap-1.5">
                  <input type="hidden" name="ticketId" value={ticket.id} />
                  <Select
                    name="projectId"
                    defaultValue={ticket.projectId ? String(ticket.projectId) : ""}
                    aria-label="Projeto"
                    className="h-8 text-[13px]"
                  >
                    <option value="">Sem projeto</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.key} — {p.name}
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    className="h-8 shrink-0"
                    aria-label="Vincular ao projeto"
                  >
                    <FolderKanban />
                  </Button>
                </form>
              )}
            </div>
          </Section>

          <Section title="Detalhes">
            <Row label="Setor">{ticket.team.name}</Row>
            <Row label="Categoria">{ticket.category?.name ?? "—"}</Row>
            {ticket.project && (
              <Row label="Projeto">
                <Link
                  href={`/projetos/${ticket.project.id}`}
                  className="font-mono text-[12px] text-primary hover:underline"
                >
                  {ticket.project.key}
                </Link>
              </Row>
            )}
            <Row label="Solicitante">
              <span className="flex items-center justify-end gap-1.5">
                <Avatar name={ticket.requester.name} id={ticket.requester.id} size="sm" />
                <span className="truncate">{ticket.requester.name}</span>
              </span>
            </Row>
            <Row label="Responsável">
              {ticket.assignee ? (
                <span className="flex items-center justify-end gap-1.5">
                  <Avatar name={ticket.assignee.name} id={ticket.assignee.id} size="sm" />
                  <span className="truncate">{ticket.assignee.name}</span>
                </span>
              ) : (
                <span className="text-muted-foreground">Ninguém</span>
              )}
            </Row>
            <Row label="Aberto em">{formatDateTime(ticket.createdAt)}</Row>
          </Section>

          <Section title={ticket.slaPolicy?.name ?? "Sem SLA"}>
            <Row label="1ª resposta">
              {ticket.firstResponseAt ? (
                <span className={ticket.slaResponseBreached ? "text-danger" : undefined}>
                  {formatMinutes(ticket.firstResponseMinutes)}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  vence {formatRelative(ticket.responseDueAt)}
                </span>
              )}
            </Row>
            <Row label="Prazo">
              <span className={ticket.slaResolutionBreached ? "text-danger" : undefined}>
                {ticket.resolutionDueAt ? formatDateTime(ticket.resolutionDueAt) : "—"}
              </span>
            </Row>
            {ticket.resolvedAt && (
              <Row label="Resolvido em">{formatMinutes(ticket.resolutionMinutes)}</Row>
            )}
            <Row label="Em atendimento">{formatMinutes(ticket.workingMinutes)}</Row>
            {totalLogged > 0 && (
              <Row label="Horas apontadas">{formatMinutes(totalLogged)}</Row>
            )}
            {ticket.reopenCount > 0 && (
              <Row label="Reaberturas">
                <span className="text-warning">{ticket.reopenCount}×</span>
              </Row>
            )}
          </Section>

          {!admin && (
            <Panel className="p-3">
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                Acompanhe as respostas por aqui. Se o problema voltar depois de
                encerrado, é só reabrir.
              </p>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}
