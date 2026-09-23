import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/rbac";
import { getSessionUser } from "@/lib/session";
import { resolveStoragePath } from "@/lib/storage";

// Entrega das fotos de equipamento.
//
// Pelo mesmo motivo dos anexos de chamado, não ficam numa pasta pública: a
// foto mostra onde fica cada máquina e o número de série. Vê quem administra
// o inventário e quem está com o equipamento no nome.

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return new Response("Não autenticado.", { status: 401 });

  const { id } = await params;
  const photoId = Number(id);
  if (!Number.isInteger(photoId) || photoId <= 0) {
    return new Response("Foto inválida.", { status: 400 });
  }

  const foto = await prisma.assetPhoto.findUnique({
    where: { id: photoId },
    select: {
      filename: true,
      mimeType: true,
      sizeBytes: true,
      storageKey: true,
      asset: { select: { assigneeId: true } },
    },
  });

  const podeVer = foto && (isAdmin(user.role) || foto.asset.assigneeId === user.id);
  // 404 e não 403, como nos anexos: quem não pode ver não descobre que existe.
  if (!podeVer) return new Response("Foto não encontrada.", { status: 404 });

  const caminho = resolveStoragePath(foto.storageKey);
  try {
    await stat(caminho);
  } catch {
    return new Response("Arquivo indisponível.", { status: 410 });
  }

  const stream = Readable.toWeb(createReadStream(caminho)) as ReadableStream;

  return new Response(stream, {
    headers: {
      "Content-Type": foto.mimeType,
      "Content-Length": String(foto.sizeBytes),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(foto.filename)}`,
      // A foto de um id nunca muda (trocar é apagar e enviar outra), então
      // pode ficar no cache do navegador — só dele, nunca de um proxy.
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
