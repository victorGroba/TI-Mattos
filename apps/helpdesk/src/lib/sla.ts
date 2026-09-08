import type { SlaPolicyModel as SlaPolicy } from "@/generated/prisma/models";
import type { Priority, TicketStatus, TicketType } from "@/generated/prisma/enums";
import {
  DEFAULT_CALENDAR,
  addBusinessMinutes,
  businessMinutesBetween,
  calendarFromPolicy,
  type BusinessCalendar,
} from "./business-hours";

/** Status em que o relógio de SLA fica parado (dependência externa ao time). */
export const WAITING_STATUSES: TicketStatus[] = [
  "WAITING_REQUESTER",
  "WAITING_THIRD_PARTY",
];

/** Status que encerram o ciclo — não há mais SLA a correr. */
export const TERMINAL_STATUSES: TicketStatus[] = ["RESOLVED", "CLOSED", "CANCELLED"];

export function isWaiting(status: TicketStatus): boolean {
  return WAITING_STATUSES.includes(status);
}

export function isTerminal(status: TicketStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export interface TicketMatch {
  teamId: number;
  type: TicketType;
  priority: Priority;
}

/**
 * Escolhe a política aplicável. Campos nulos na política são curingas; entre
 * as que casam, vence a mais específica. O peso do setor é maior que o do tipo,
 * que é maior que o da prioridade — assim uma regra escrita para a TI ganha de
 * uma regra genérica para "URGENT", que é o comportamento que as pessoas
 * esperam ao configurar uma exceção para o próprio setor.
 */
export function selectPolicy(
  policies: SlaPolicy[],
  ticket: TicketMatch,
): SlaPolicy | null {
  let best: SlaPolicy | null = null;
  let bestScore = -1;

  for (const policy of policies) {
    if (!policy.active) continue;
    if (policy.teamId !== null && policy.teamId !== ticket.teamId) continue;
    if (policy.type !== null && policy.type !== ticket.type) continue;
    if (policy.priority !== null && policy.priority !== ticket.priority) continue;

    const score =
      (policy.teamId !== null ? 4 : 0) +
      (policy.type !== null ? 2 : 0) +
      (policy.priority !== null ? 1 : 0);

    // > e não >=: empate mantém a primeira, que vem ordenada por id, para a
    // escolha ser estável entre execuções.
    if (score > bestScore) {
      best = policy;
      bestScore = score;
    }
  }

  return best;
}

export function calendarFor(policy: SlaPolicy | null): BusinessCalendar {
  if (!policy || !policy.businessHoursOnly) return DEFAULT_CALENDAR;
  return calendarFromPolicy(policy);
}

/**
 * Mede a distância entre dois instantes na régua da política: horário útil
 * quando ela pede isso, tempo corrido caso contrário (o normal em demandas de
 * projeto, que têm prazo de calendário).
 */
export function elapsedMinutes(
  from: Date,
  to: Date,
  policy: SlaPolicy | null,
): number {
  if (to <= from) return 0;
  if (!policy || !policy.businessHoursOnly) {
    return Math.round((to.getTime() - from.getTime()) / 60_000);
  }
  return businessMinutesBetween(from, to, calendarFromPolicy(policy));
}

function addMinutes(from: Date, minutes: number, policy: SlaPolicy | null): Date {
  if (!policy || !policy.businessHoursOnly) {
    return new Date(from.getTime() + minutes * 60_000);
  }
  return addBusinessMinutes(from, minutes, calendarFromPolicy(policy));
}

export interface SlaDeadlines {
  slaPolicyId: number | null;
  responseDueAt: Date | null;
  resolutionDueAt: Date | null;
}

/** Prazos de primeira resposta e de solução, calculados na abertura. */
export function computeDeadlines(
  policy: SlaPolicy | null,
  createdAt: Date,
): SlaDeadlines {
  if (!policy) {
    return { slaPolicyId: null, responseDueAt: null, resolutionDueAt: null };
  }

  return {
    slaPolicyId: policy.id,
    responseDueAt: addMinutes(createdAt, policy.responseMinutes, policy),
    resolutionDueAt: addMinutes(createdAt, policy.resolutionMinutes, policy),
  };
}

/**
 * Reprojeta o prazo de solução depois de uma pausa. O tempo parado em
 * WAITING_* não pode consumir SLA — sem isso, um chamado que ficou três dias
 * esperando resposta do solicitante apareceria como atrasado por culpa do time.
 */
export function extendDeadlineForPause(
  resolutionDueAt: Date | null,
  pausedMinutes: number,
  policy: SlaPolicy | null,
): Date | null {
  if (!resolutionDueAt || pausedMinutes <= 0) return resolutionDueAt;
  if (!policy?.pauseOnWaiting) return resolutionDueAt;
  return addMinutes(resolutionDueAt, pausedMinutes, policy);
}

export type SlaHealth = "ok" | "warning" | "breached" | "none";

/**
 * Situação do prazo para efeito de UI: `warning` a partir de 80% do tempo
 * consumido, que é quando ainda dá para agir.
 */
export function slaHealth(
  now: Date,
  createdAt: Date,
  dueAt: Date | null,
  breached: boolean,
): SlaHealth {
  if (breached) return "breached";
  if (!dueAt) return "none";
  if (now >= dueAt) return "breached";

  const total = dueAt.getTime() - createdAt.getTime();
  if (total <= 0) return "breached";

  const consumed = (now.getTime() - createdAt.getTime()) / total;
  return consumed >= 0.8 ? "warning" : "ok";
}
