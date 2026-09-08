import { prisma } from "./prisma";
import { sendMail, ticketUrl } from "./mail";
import { formatDateTime } from "./format";
import { priorityLabels, statusLabels, typeLabels } from "./labels";

// Quem é avisado, e como.
//
// Um lugar só para as duas formas de aviso — o sino dentro do sistema e o
// e-mail. Se ficassem separados, um evento novo seria inevitavelmente
// adicionado a um e esquecido no outro.
//
// Nada aqui bloqueia a ação do usuário: a gravação da notificação é aguardada
// (é rápida e no mesmo banco), mas o e-mail sai em segundo plano.

type TicketParaAviso = {
  id: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  type: string;
  requesterId: number;
  createdAt: Date;
  team?: { name: string } | null;
  requester?: { id: number; name: string; email: string } | null;
};

/** Administradores ativos, que são quem atende. */
async function admins(exceto?: number) {
  return prisma.user.findMany({
    where: {
      role: "ADMIN",
      active: true,
      ...(exceto ? { id: { not: exceto } } : {}),
      // A conta de integração existe só para assinar ações da API.
      email: { not: "integracao@sistema.local" },
    },
    select: { id: true, email: true },
  });
}

async function registrarSino(
  destinatarios: Array<{ id: number }>,
  dados: { ticketId: number; type: string; title: string; body?: string },
) {
  if (destinatarios.length === 0) return;
  await prisma.notification.createMany({
    data: destinatarios.map((d) => ({
      userId: d.id,
      ticketId: dados.ticketId,
      type: dados.type,
      title: dados.title,
      body: dados.body ?? null,
    })),
  });
}

/** Recorta o texto para o e-mail sem cortar no meio de uma palavra. */
function resumo(texto: string, max = 400): string {
  if (texto.length <= max) return texto;
  const corte = texto.slice(0, max);
  const espaco = corte.lastIndexOf(" ");
  return `${corte.slice(0, espaco > max * 0.6 ? espaco : max)}…`;
}

// ===================== CHAMADO ABERTO =====================

/** Avisa a TI de que chegou demanda. */
export async function notificarChamadoCriado(ticket: TicketParaAviso): Promise<void> {
  const destinatarios = await admins(ticket.requesterId);

  await registrarSino(destinatarios, {
    ticketId: ticket.id,
    type: "ticket.created",
    title: `Chamado novo #${ticket.id}`,
    body: ticket.title,
  });

  sendMail({
    to: destinatarios.map((d) => d.email),
    subject: `[HelpDesk #${ticket.id}] ${ticket.title}`,
    intro: "Chegou um chamado novo.",
    linhas: [
      { rotulo: "Número", valor: `#${ticket.id}` },
      { rotulo: "Assunto", valor: ticket.title },
      { rotulo: "Tipo", valor: typeLabels[ticket.type as never] ?? ticket.type },
      { rotulo: "Aberto por", valor: ticket.requester?.name ?? "—" },
      { rotulo: "Setor", valor: ticket.team?.name ?? "—" },
      { rotulo: "Data", valor: formatDateTime(ticket.createdAt) },
    ],
    citacao: resumo(ticket.description),
    acaoUrl: ticketUrl(ticket.id),
    acaoTexto: "Abrir o chamado",
    rodape: "Você recebe este aviso porque é administrador do HelpDesk.",
  });
}

// ===================== NOVA RESPOSTA =====================

/**
 * Avisa a outra parte da conversa.
 *
 * Se quem respondeu foi a TI, avisa o solicitante; se foi o solicitante, avisa
 * a TI. Nota interna nunca gera aviso para o solicitante — ele não a vê.
 */
export async function notificarResposta(
  ticket: TicketParaAviso,
  autor: { id: number; name: string },
  corpo: string,
  interna: boolean,
): Promise<void> {
  if (interna) return;

  const autorEhSolicitante = autor.id === ticket.requesterId;

  const destinatarios = autorEhSolicitante
    ? await admins(autor.id)
    : ticket.requester && ticket.requester.id !== autor.id
      ? [{ id: ticket.requester.id, email: ticket.requester.email }]
      : [];

  if (destinatarios.length === 0) return;

  await registrarSino(destinatarios, {
    ticketId: ticket.id,
    type: "ticket.commented",
    title: `Nova resposta no #${ticket.id}`,
    body: `${autor.name}: ${resumo(corpo, 90)}`,
  });

  sendMail({
    to: destinatarios.map((d) => d.email),
    subject: `[HelpDesk #${ticket.id}] Nova resposta — ${ticket.title}`,
    intro: `${autor.name} respondeu ao chamado.`,
    linhas: [
      { rotulo: "Número", valor: `#${ticket.id}` },
      { rotulo: "Assunto", valor: ticket.title },
      { rotulo: "Situação", valor: statusLabels[ticket.status as never] ?? ticket.status },
    ],
    citacao: resumo(corpo, 800),
    acaoUrl: ticketUrl(ticket.id),
    acaoTexto: "Responder",
    rodape: autorEhSolicitante
      ? "Você recebe este aviso porque é administrador do HelpDesk."
      : "Responda por aqui mesmo — basta abrir o chamado e escrever.",
  });
}

// ===================== RESOLVIDO / ENCERRADO =====================

export async function notificarResolucao(
  ticket: TicketParaAviso,
  porQuem: { name: string } | null,
): Promise<void> {
  if (!ticket.requester) return;

  const encerrado = ticket.status === "CLOSED";

  await registrarSino([{ id: ticket.requester.id }], {
    ticketId: ticket.id,
    type: encerrado ? "ticket.closed" : "ticket.resolved",
    title: `Chamado #${ticket.id} ${encerrado ? "encerrado" : "resolvido"}`,
    body: ticket.title,
  });

  sendMail({
    to: ticket.requester.email,
    subject: `[HelpDesk #${ticket.id}] ${encerrado ? "Encerrado" : "Resolvido"} — ${ticket.title}`,
    intro: `Seu chamado foi ${encerrado ? "encerrado" : "marcado como resolvido"}.`,
    linhas: [
      { rotulo: "Número", valor: `#${ticket.id}` },
      { rotulo: "Assunto", valor: ticket.title },
      ...(porQuem ? [{ rotulo: "Por", valor: porQuem.name }] : []),
    ],
    acaoUrl: ticketUrl(ticket.id),
    acaoTexto: "Ver o chamado",
    rodape:
      "Se o problema voltar, é só abrir o chamado e escrever — ele volta para a fila da TI.",
  });
}

// ===================== SLA ESTOURADO =====================

export async function notificarSlaEstourado(
  ticket: TicketParaAviso,
  tipo: "resposta" | "solucao",
): Promise<void> {
  const destinatarios = await admins();
  if (destinatarios.length === 0) return;

  const rotulo = tipo === "resposta" ? "primeira resposta" : "solução";

  await registrarSino(destinatarios, {
    ticketId: ticket.id,
    type: `sla.${tipo}`,
    title: `Prazo de ${rotulo} estourado — #${ticket.id}`,
    body: ticket.title,
  });

  sendMail({
    to: destinatarios.map((d) => d.email),
    subject: `[HelpDesk #${ticket.id}] Prazo de ${rotulo} estourado`,
    intro: `O prazo de ${rotulo} deste chamado venceu.`,
    linhas: [
      { rotulo: "Número", valor: `#${ticket.id}` },
      { rotulo: "Assunto", valor: ticket.title },
      { rotulo: "Prioridade", valor: priorityLabels[ticket.priority as never] ?? ticket.priority },
      { rotulo: "Aberto em", valor: formatDateTime(ticket.createdAt) },
      { rotulo: "Setor", valor: ticket.team?.name ?? "—" },
    ],
    acaoUrl: ticketUrl(ticket.id),
    acaoTexto: "Atender agora",
    rodape: "Você recebe este aviso porque é administrador do HelpDesk.",
  });
}
