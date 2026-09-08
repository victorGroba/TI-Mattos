import { env } from "@/lib/env";
import { sweepSlaBreaches } from "@/lib/tickets";

// Varredura de prazos vencidos.
//
// Precisa de uma rotina externa porque o estouro de SLA não é causado por
// ninguém: o prazo simplesmente vence, sem clique nem requisição que dispare a
// checagem. Sem isso, o chamado só apareceria como atrasado quando alguém
// abrisse a tela.
//
// Agende a cada 15 minutos, na VPS:
//   */15 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
//     https://helpdesk.ti-labmattos.online/api/cron/sla > /dev/null

export const dynamic = "force-dynamic";

function autorizado(request: Request): boolean {
  if (!env.CRON_SECRET) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${env.CRON_SECRET}`;
}

export async function GET(request: Request) {
  // Sem segredo configurado a rota fica DESLIGADA, e não aberta: um endpoint
  // público que dispara e-mail para todos os administradores é um belo
  // amplificador de spam.
  if (!env.CRON_SECRET) {
    return Response.json(
      { error: "CRON_SECRET não configurado — rotina desativada." },
      { status: 503 },
    );
  }
  if (!autorizado(request)) {
    return new Response("Não autorizado.", { status: 401 });
  }

  const inicio = Date.now();
  const resultado = await sweepSlaBreaches();

  return Response.json({
    ok: true,
    respostaEstourada: resultado.response,
    solucaoEstourada: resultado.resolution,
    duracaoMs: Date.now() - inicio,
  });
}
