import {
  ArrowRightLeft,
  CircleDot,
  Clock,
  Lock,
  MessageSquare,
  RotateCcw,
  TimerOff,
  UserRound,
} from "lucide-react";
import type { EventType } from "@/generated/prisma/enums";
import { Avatar } from "@/components/ui/misc";
import { AttachmentList } from "./attachment-list";
import { formatDateTime, formatMinutes } from "@/lib/format";
import { priorityLabels, statusLabels, typeLabels } from "@/lib/labels";
import type { TicketDetail } from "@/lib/ticket-queries";
import { cn } from "@/lib/utils";

// Uma linha do tempo só, misturando conversa e mudanças de estado em ordem
// cronológica. Separar as duas coisas em abas obrigaria a pessoa a cruzar
// horários na cabeça para entender por que um chamado demorou.

type Comment = TicketDetail["comments"][number];
type Event = TicketDetail["events"][number];

type Entry =
  | { kind: "comment"; at: Date; comment: Comment }
  | { kind: "event"; at: Date; event: Event };

/** Eventos que já ficam evidentes pelo próprio comentário exibido ao lado. */
const REDUNDANT_EVENTS: EventType[] = ["COMMENT_ADDED", "INTERNAL_NOTE_ADDED", "CREATED"];

function describeEvent(event: Event): { text: string; icon: typeof CircleDot } {
  const actor = event.actor?.name ?? "Sistema";

  switch (event.type) {
    case "STATUS_CHANGED":
      return {
        text: `${actor} mudou o status de ${statusLabels[event.fromValue as never] ?? event.fromValue} para ${statusLabels[event.toValue as never] ?? event.toValue}`,
        icon: ArrowRightLeft,
      };
    case "REOPENED":
      return { text: `${actor} reabriu o chamado`, icon: RotateCcw };
    case "ASSIGNED":
      return { text: `${actor} definiu o responsável`, icon: UserRound };
    case "UNASSIGNED":
      return { text: `${actor} removeu o responsável`, icon: UserRound };
    case "PRIORITY_CHANGED":
      return {
        text: `${actor} mudou a prioridade para ${priorityLabels[event.toValue as never] ?? event.toValue}`,
        icon: CircleDot,
      };
    case "TYPE_CHANGED":
      return {
        text: `${actor} mudou o tipo para ${typeLabels[event.toValue as never] ?? event.toValue}`,
        icon: CircleDot,
      };
    case "TEAM_CHANGED":
      return { text: `${actor} transferiu de setor`, icon: ArrowRightLeft };
    case "FIRST_RESPONSE": {
      const minutes = (event.metadata as { minutes?: number } | null)?.minutes;
      return {
        text: `Primeira resposta${minutes !== undefined ? ` em ${formatMinutes(minutes)}` : ""}`,
        icon: MessageSquare,
      };
    }
    case "SLA_RESPONSE_BREACHED":
      return { text: "Prazo de primeira resposta estourado", icon: TimerOff };
    case "SLA_RESOLUTION_BREACHED":
      return { text: "Prazo de solução estourado", icon: TimerOff };
    case "TIME_LOGGED": {
      const minutes = (event.metadata as { minutes?: number } | null)?.minutes;
      return {
        text: `${actor} apontou ${formatMinutes(minutes)} de trabalho`,
        icon: Clock,
      };
    }
    default:
      return { text: `${actor} atualizou o chamado`, icon: CircleDot };
  }
}

export function Timeline({
  ticket,
  canSeeInternal,
}: {
  ticket: TicketDetail;
  canSeeInternal: boolean;
}) {
  const entries: Entry[] = [
    ...ticket.comments
      // A nota interna nunca chega ao solicitante: filtrada aqui e também na
      // consulta que monta os e-mails.
      .filter((c) => canSeeInternal || !c.internal)
      .map((c): Entry => ({ kind: "comment", at: c.createdAt, comment: c })),
    ...ticket.events
      .filter((e) => !REDUNDANT_EVENTS.includes(e.type))
      .map((e): Entry => ({ kind: "event", at: e.createdAt, event: e })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  if (entries.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nenhuma movimentação ainda.
      </p>
    );
  }

  return (
    <ol className="space-y-4">
      {entries.map((entry) => {
        if (entry.kind === "event") {
          const { text, icon: Icon } = describeEvent(entry.event);
          return (
            <li key={`e-${entry.event.id}`} className="flex items-center gap-2.5 pl-1">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-subtle-foreground">
                <Icon className="size-3" />
              </span>
              <p className="text-xs text-muted-foreground">
                {text}
                <span className="ml-1.5 text-subtle-foreground">
                  · {formatDateTime(entry.at)}
                </span>
              </p>
            </li>
          );
        }

        const { comment } = entry;
        return (
          <li key={`c-${comment.id}`} className="flex gap-2.5">
            <Avatar
              name={comment.author?.name ?? "Sistema"}
              id={comment.author?.id}
              size="sm"
              className="mt-0.5"
            />
            <div
              className={cn(
                "min-w-0 flex-1 rounded-lg border px-3.5 py-2.5",
                comment.internal
                  ? "border-warning/30 bg-warning-subtle"
                  : "border-border bg-surface-muted",
              )}
            >
              <div className="mb-1 flex flex-wrap items-center gap-x-2">
                <span className="text-sm font-medium text-foreground">
                  {comment.author?.name ?? "Sistema"}
                </span>
                {comment.internal && (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-warning">
                    <Lock className="size-3" />
                    Nota interna
                  </span>
                )}
                <span className="ml-auto text-xs text-subtle-foreground">
                  {formatDateTime(comment.createdAt)}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
                {comment.body}
              </p>
              {comment.attachments.length > 0 && (
                <div className="mt-2.5">
                  <AttachmentList itens={comment.attachments} compacto />
                </div>
              )}
            </div>
          </li>
        );
      })}
      <li aria-hidden className="sr-only">
        {entries.length} {entries.length === 1 ? "registro" : "registros"}
      </li>
    </ol>
  );
}
