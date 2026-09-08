import { createHmac, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";

// Eventos publicados para o n8n. A lista é fechada de propósito: a tela de
// integrações oferece só estes, e um typo vira erro de compilação.
export const WEBHOOK_EVENTS = [
  "ticket.created",
  "ticket.updated",
  "ticket.status_changed",
  "ticket.assigned",
  "ticket.commented",
  "ticket.resolved",
  "ticket.closed",
  "ticket.reopened",
  "sla.response_breached",
  "sla.resolution_breached",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  "ticket.created": "Chamado criado",
  "ticket.updated": "Chamado alterado",
  "ticket.status_changed": "Status alterado",
  "ticket.assigned": "Responsável definido",
  "ticket.commented": "Nova resposta",
  "ticket.resolved": "Chamado resolvido",
  "ticket.closed": "Chamado encerrado",
  "ticket.reopened": "Chamado reaberto",
  "sla.response_breached": "SLA de resposta estourado",
  "sla.resolution_breached": "SLA de solução estourado",
};

const MAX_ATTEMPTS = 6;
const REQUEST_TIMEOUT_MS = 10_000;

/** Espera 1min, 5min, 15min, 1h, 6h entre as tentativas. */
const RETRY_BACKOFF_MINUTES = [1, 5, 15, 60, 360];

export function signPayload(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/** Comparação em tempo constante, para o n8n validar a assinatura de volta. */
export function verifySignature(body: string, secret: string, signature: string): boolean {
  const expected = Buffer.from(signPayload(body, secret), "utf8");
  const received = Buffer.from(signature, "utf8");
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

/**
 * Grava a entrega pendente para cada endpoint inscrito. Só enfileira — a
 * entrega em si acontece em dispatchPending(), para que uma indisponibilidade
 * do n8n nunca derrube ou atrase a ação do usuário no sistema.
 */
export async function enqueueWebhook(
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<number> {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { active: true, events: { has: event } },
    select: { id: true },
  });

  if (endpoints.length === 0) return 0;

  await prisma.webhookDelivery.createMany({
    data: endpoints.map((e) => ({
      endpointId: e.id,
      event,
      payload: {
        event,
        sentAt: new Date().toISOString(),
        data: payload,
      } as Prisma.InputJsonObject,
      nextRetryAt: new Date(),
    })),
  });

  return endpoints.length;
}

async function deliverOne(deliveryId: number): Promise<void> {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { endpoint: true },
  });
  if (!delivery || delivery.status === "DELIVERED") return;

  const body = JSON.stringify(delivery.payload);
  const extraHeaders =
    delivery.endpoint.headers && typeof delivery.endpoint.headers === "object"
      ? (delivery.endpoint.headers as Record<string, string>)
      : {};

  const attempt = delivery.attempts + 1;

  try {
    const response = await fetch(delivery.endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Helpdesk-Event": delivery.event,
        "X-Helpdesk-Delivery": String(delivery.id),
        "X-Helpdesk-Signature": signPayload(body, delivery.endpoint.secret),
        ...extraHeaders,
      },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const text = (await response.text().catch(() => "")).slice(0, 2000);

    if (response.ok) {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "DELIVERED",
          attempts: attempt,
          responseStatus: response.status,
          responseBody: text,
          deliveredAt: new Date(),
          nextRetryAt: null,
          lastError: null,
        },
      });
      return;
    }

    await scheduleRetry(delivery.id, attempt, `HTTP ${response.status}`, response.status, text);
  } catch (error) {
    await scheduleRetry(
      delivery.id,
      attempt,
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function scheduleRetry(
  deliveryId: number,
  attempt: number,
  lastError: string,
  responseStatus?: number,
  responseBody?: string,
): Promise<void> {
  const exhausted = attempt >= MAX_ATTEMPTS;
  const backoff = RETRY_BACKOFF_MINUTES[Math.min(attempt - 1, RETRY_BACKOFF_MINUTES.length - 1)];

  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      status: exhausted ? "ABANDONED" : "FAILED",
      attempts: attempt,
      lastError: lastError.slice(0, 500),
      responseStatus: responseStatus ?? null,
      responseBody: responseBody ?? null,
      nextRetryAt: exhausted ? null : new Date(Date.now() + backoff * 60_000),
    },
  });
}

/**
 * Envia o que estiver vencido. Chamado logo após enfileirar (para a entrega
 * ser praticamente imediata) e por /api/cron/webhooks, que é quem garante as
 * retentativas quando ninguém está usando o sistema.
 */
export async function dispatchPending(limit = 25): Promise<number> {
  const pending = await prisma.webhookDelivery.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      nextRetryAt: { lte: new Date() },
    },
    orderBy: { nextRetryAt: "asc" },
    take: limit,
    select: { id: true },
  });

  for (const { id } of pending) {
    await deliverOne(id);
  }

  return pending.length;
}

/**
 * Dispara os webhooks sem bloquear a resposta ao usuário. Erros só viram log:
 * a fila no banco já garante que nada se perde e a retentativa acontece depois.
 */
export function emitWebhook(event: WebhookEvent, payload: Record<string, unknown>): void {
  void enqueueWebhook(event, payload)
    .then((count) => (count > 0 ? dispatchPending() : 0))
    .catch((error) => {
      console.error(`[webhook] falha ao enfileirar ${event}:`, error);
    });
}
