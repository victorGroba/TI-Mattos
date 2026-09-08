import Link from "next/link";
import { AlertTriangle, MessageSquareDashed } from "lucide-react";
import { PriorityBadge, StatusBadge, TypeBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/misc";
import { formatRelative } from "@/lib/format";
import type { TicketListItem } from "@/lib/ticket-queries";

/**
 * Uma linha da fila, em colunas de largura fixa.
 *
 * A densidade é intencional: o atendente varre dezenas de chamados de uma vez.
 * Colunas alinhadas — e não blocos empilhados por linha — deixam o olho descer
 * pela vertical comparando status com status e prazo com prazo, que é como se
 * decide "qual eu pego agora".
 */
export function TicketRow({ ticket }: { ticket: TicketListItem }) {
  const overdue = ticket.slaResolutionBreached;
  const awaitingFirstResponse = !ticket.firstResponseAt && !ticket.resolutionMinutes;

  return (
    <li className="border-t border-border first:border-t-0">
      <Link
        href={`/chamados/${ticket.id}`}
        className="flex items-center gap-3 py-2 pr-1 transition-colors hover:bg-surface-muted/60"
      >
        <span className="tabular w-10 shrink-0 text-[11px] text-subtle-foreground">
          {ticket.id}
        </span>

        {/* Coluna de sinal: reserva largura fixa mesmo vazia, para os títulos
            começarem todos na mesma vertical. */}
        <span className="flex w-4 shrink-0 justify-center">
          {overdue ? (
            <AlertTriangle className="size-3.5 text-danger" aria-label="Fora do prazo" />
          ) : awaitingFirstResponse ? (
            <MessageSquareDashed
              className="size-3.5 text-warning"
              aria-label="Sem primeira resposta"
            />
          ) : null}
        </span>

        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
          {ticket.title}
          {ticket.project && (
            <span className="ml-2 font-mono text-[10px] text-subtle-foreground">
              {ticket.project.key}
            </span>
          )}
        </span>

        <span className="hidden w-32 shrink-0 truncate text-[12px] text-subtle-foreground xl:block">
          {ticket.requester.name}
        </span>
        <span className="hidden w-24 shrink-0 truncate text-[12px] text-subtle-foreground lg:block">
          {ticket.team.name}
        </span>

        <span className="hidden w-[7.5rem] shrink-0 md:block">
          <TypeBadge type={ticket.type} />
        </span>
        <span className="hidden w-[5.5rem] shrink-0 sm:block">
          <PriorityBadge priority={ticket.priority} />
        </span>
        <span className="hidden w-[10rem] shrink-0 sm:block">
          <StatusBadge status={ticket.status} />
        </span>

        <span className="w-20 shrink-0 text-right text-[12px] text-subtle-foreground">
          {formatRelative(ticket.createdAt)}
        </span>

        {ticket.assignee ? (
          <Avatar name={ticket.assignee.name} id={ticket.assignee.id} size="sm" />
        ) : (
          <span
            className="size-6 shrink-0 rounded-full border border-dashed border-border-strong"
            title="Sem responsável"
          />
        )}
      </Link>
    </li>
  );
}
