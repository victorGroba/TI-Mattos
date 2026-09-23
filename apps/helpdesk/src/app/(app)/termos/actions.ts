"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { notifyTermSigned } from "@/lib/assets";
import { clientIp, isValidSignature } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

// Assinatura do termo de responsabilidade.
//
// Só a própria pessoa assina o próprio termo — nem o administrador assina por
// ela. O que fica gravado como evidência: o texto exato (conferido pelo hash
// que a tela exibiu), a imagem da assinatura, data e hora, IP e navegador.

export interface SignState {
  error?: string;
  ok?: boolean;
}

export async function signTermAction(_prev: SignState, formData: FormData): Promise<SignState> {
  const user = await requireUser();

  const termId = Number(formData.get("termId"));
  if (!Number.isInteger(termId) || termId <= 0) return { error: "Termo inválido." };

  const term = await prisma.responsibilityTerm.findUnique({
    where: { id: termId },
    select: { id: true, userId: true, status: true, bodyHash: true, assetId: true },
  });

  // Termo de outra pessoa responde como inexistente, como nos anexos: quem
  // não pode assinar também não precisa saber que ele existe.
  if (!term || term.userId !== user.id) return { error: "Termo não encontrado." };
  if (term.status !== "PENDING") {
    return { error: "Este termo não está mais aguardando assinatura. Atualize a página." };
  }

  // O hash vem da tela que a pessoa leu. Se o termo tivesse sido reemitido
  // com outro texto nesse meio-tempo, ela estaria assinando algo que não viu.
  if (formData.get("bodyHash") !== term.bodyHash) {
    return { error: "O texto do termo mudou desde que você abriu a página. Atualize e leia de novo." };
  }

  if (formData.get("aceite") !== "on") {
    return { error: "Marque que leu e concorda com o termo." };
  }

  const assinatura = String(formData.get("assinatura") ?? "");
  if (!isValidSignature(assinatura)) {
    return { error: "Desenhe sua assinatura no quadro antes de confirmar." };
  }

  const h = await headers();
  const agora = new Date();

  // updateMany com o status no filtro: se dois envios chegarem juntos (duplo
  // clique, duas abas), só o primeiro encontra o termo pendente.
  const { count } = await prisma.responsibilityTerm.updateMany({
    where: { id: term.id, userId: user.id, status: "PENDING" },
    data: {
      status: "SIGNED",
      signedAt: agora,
      signatureImage: assinatura,
      signerIp: clientIp(h),
      signerUserAgent: h.get("user-agent")?.slice(0, 400) ?? null,
    },
  });
  if (count === 0) return { error: "Este termo já foi assinado." };

  await prisma.assetEvent.create({
    data: { assetId: term.assetId, actorId: user.id, type: "TERM_SIGNED", toValue: user.name },
  });

  await notifyTermSigned(term.id);

  revalidatePath(`/termos/${term.id}`);
  revalidatePath("/meus-equipamentos");
  revalidatePath(`/inventario/${term.assetId}`);
  return { ok: true };
}
