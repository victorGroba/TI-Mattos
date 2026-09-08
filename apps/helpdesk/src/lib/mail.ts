import nodemailer, { type Transporter } from "nodemailer";
import { env, mailEnabled } from "./env";

// Envio de e-mail.
//
// O sistema antigo engolia toda falha num try/except com um print, e o e-mail
// ficou meses quebrado sem ninguém perceber. Aqui é o contrário: quando não há
// credencial, o envio é DESLIGADO de forma explícita e cada tentativa é
// registrada no log; quando há, toda falha vira log de erro com o destinatário
// e o assunto. Nunca falha em silêncio, e nunca derruba a ação do usuário.

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!mailEnabled) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER!, pass: env.SMTP_PASSWORD! },
    // O servidor demora a responder às vezes; sem limite, uma conexão presa
    // seguraria o processo de envio indefinidamente.
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return transporter;
}

export interface MailMessage {
  to: string | string[];
  subject: string;
  /** Corpo em texto puro; o HTML é montado a partir dele. */
  intro: string;
  linhas?: Array<{ rotulo: string; valor: string }>;
  citacao?: string;
  acaoUrl?: string;
  acaoTexto?: string;
  rodape?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Layout único para todo e-mail do sistema.
 *
 * Tabelas e estilo em atributos, não CSS externo: cliente de e-mail (Outlook
 * em especial) ignora folha de estilo e boa parte do CSS moderno. É feio de
 * escrever e é o que funciona em todos.
 */
function renderHtml(msg: MailMessage): string {
  const linhas = (msg.linhas ?? [])
    .map(
      (l) => `
        <tr>
          <td style="padding:3px 12px 3px 0;color:#5f7278;font-size:13px;white-space:nowrap;">${escapeHtml(l.rotulo)}</td>
          <td style="padding:3px 0;color:#1b262b;font-size:13px;">${escapeHtml(l.valor)}</td>
        </tr>`,
    )
    .join("");

  const citacao = msg.citacao
    ? `<div style="margin:16px 0;padding:12px 14px;background:#f4f6f7;border-left:3px solid #3a757f;border-radius:4px;color:#1b262b;font-size:14px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(msg.citacao)}</div>`
    : "";

  const botao =
    msg.acaoUrl && msg.acaoTexto
      ? `<div style="margin:22px 0 6px;">
           <a href="${msg.acaoUrl}" style="display:inline-block;background:#3a757f;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;">${escapeHtml(msg.acaoTexto)}</a>
         </div>`
      : "";

  return `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:24px 12px;background:#f4f6f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dfe5e7;border-radius:10px;">
    <tr><td style="padding:22px 26px 0;">
      <div style="font-size:12px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#3a757f;">HelpDesk · Lab Mattos</div>
    </td></tr>
    <tr><td style="padding:14px 26px 4px;">
      <div style="font-size:16px;font-weight:600;color:#1b262b;line-height:1.45;">${escapeHtml(msg.intro)}</div>
    </td></tr>
    ${linhas ? `<tr><td style="padding:12px 26px 0;"><table role="presentation" cellpadding="0" cellspacing="0">${linhas}</table></td></tr>` : ""}
    <tr><td style="padding:0 26px;">${citacao}${botao}</td></tr>
    <tr><td style="padding:18px 26px 24px;border-top:1px solid #dfe5e7;color:#82949c;font-size:12px;line-height:1.5;">
      ${escapeHtml(msg.rodape ?? "Você recebeu este aviso porque participa deste chamado.")}
    </td></tr>
  </table>
</body></html>`;
}

function renderText(msg: MailMessage): string {
  const partes = [msg.intro, ""];
  for (const l of msg.linhas ?? []) partes.push(`${l.rotulo}: ${l.valor}`);
  if (msg.citacao) partes.push("", msg.citacao);
  if (msg.acaoUrl) partes.push("", `${msg.acaoTexto ?? "Abrir"}: ${msg.acaoUrl}`);
  partes.push("", msg.rodape ?? "Você recebeu este aviso porque participa deste chamado.");
  return partes.join("\n");
}

/**
 * Envia sem bloquear quem chamou. Uma indisponibilidade do servidor de e-mail
 * nunca pode impedir alguém de abrir ou responder um chamado.
 */
export function sendMail(msg: MailMessage): void {
  const destinatarios = (Array.isArray(msg.to) ? msg.to : [msg.to]).filter(Boolean);
  if (destinatarios.length === 0) return;

  const transport = getTransporter();
  if (!transport) {
    // Explícito, não silencioso: aparece no log toda vez que um e-mail
    // deixou de sair por falta de configuração.
    console.warn(
      `[mail] SMTP não configurado — e-mail NÃO enviado para ${destinatarios.join(", ")}: "${msg.subject}"`,
    );
    return;
  }

  void transport
    .sendMail({
      from: env.MAIL_FROM || env.SMTP_USER,
      to: destinatarios,
      subject: msg.subject,
      text: renderText(msg),
      html: renderHtml(msg),
    })
    .catch((error) => {
      console.error(
        `[mail] falha ao enviar "${msg.subject}" para ${destinatarios.join(", ")}:`,
        error instanceof Error ? error.message : error,
      );
    });
}

/** Verifica a conexão SMTP. Usado pela tela de diagnóstico. */
export async function verifyMail(): Promise<{ ok: boolean; erro?: string }> {
  const transport = getTransporter();
  if (!transport) return { ok: false, erro: "SMTP não configurado (falta SMTP_USER/SMTP_PASSWORD)." };

  try {
    await transport.verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, erro: error instanceof Error ? error.message : String(error) };
  }
}

export function ticketUrl(ticketId: number): string {
  return `${env.APP_URL.replace(/\/$/, "")}/chamados/${ticketId}`;
}
