import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { prisma } from "@/lib/prisma";
import { canViewTicket } from "@/lib/rbac";
import { getSessionUser } from "@/lib/session";
import { isImage, resolveStoragePath } from "@/lib/storage";

// Entrega de anexos.
//
// Passa por aqui, e não por uma pasta pública, porque anexo de chamado contém
// print de tela com dado interno. Cada download revalida se a pessoa pode ver
// aquele chamado — servir de /public daria acesso a qualquer um com a URL.

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return new Response("Não autenticado.", { status: 401 });

  const { id } = await params;
  const attachmentId = Number(id);
  if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
    return new Response("Anexo inválido.", { status: 400 });
  }

  const anexo = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: {
      filename: true,
      mimeType: true,
      sizeBytes: true,
      storageKey: true,
      ticketId: true,
      ticket: { select: { requesterId: true } },
    },
  });

  if (!anexo?.ticket) return new Response("Anexo não encontrado.", { status: 404 });

  const watchers = await prisma.ticketWatcher.findMany({
    where: { ticketId: anexo.ticketId! },
    select: { userId: true },
  });

  const podeVer = canViewTicket(user, {
    requesterId: anexo.ticket.requesterId,
    watcherIds: watchers.map((w) => w.userId),
  });

  // 404 e não 403: quem não pode ver o chamado também não deveria descobrir
  // que aquele anexo existe.
  if (!podeVer) return new Response("Anexo não encontrado.", { status: 404 });

  const caminho = resolveStoragePath(anexo.storageKey);

  try {
    await stat(caminho);
  } catch {
    return new Response("Arquivo indisponível.", { status: 410 });
  }

  const stream = Readable.toWeb(createReadStream(caminho)) as ReadableStream;

  return new Response(stream, {
    headers: {
      "Content-Type": anexo.mimeType,
      "Content-Length": String(anexo.sizeBytes),
      // Imagem abre na página; o resto baixa. `filename*` preserva acento no
      // nome original.
      "Content-Disposition": `${isImage(anexo.mimeType) ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(anexo.filename)}`,
      // Privado: o conteúdo é por usuário, então nenhum proxy compartilhado
      // (Cloudflare incluído) pode guardar uma cópia.
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
