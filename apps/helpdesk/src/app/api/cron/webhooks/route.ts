import { env } from "@/lib/env";
import { dispatchPending } from "@/lib/webhooks";

// Retentativa das entregas de webhook.
//
// O envio já acontece na hora do evento; esta rotina existe para o caso de o
// n8n estar fora do ar naquele instante. A fila fica no banco, então nada se
// perde — só espera a próxima passagem.
//
// Agende a cada 5 minutos, na VPS:
//   */5 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
//     https://helpdesk.ti-labmattos.online/api/cron/webhooks > /dev/null

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!env.CRON_SECRET) {
    return Response.json(
      { error: "CRON_SECRET não configurado — rotina desativada." },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Não autorizado.", { status: 401 });
  }

  const enviadas = await dispatchPending(50);
  return Response.json({ ok: true, entregasProcessadas: enviadas });
}
