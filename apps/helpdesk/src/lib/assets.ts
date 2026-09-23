import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { formatDate } from "./format";
import { DEFAULT_TERM_TEMPLATE, assetName, formatTag, renderTerm } from "./inventory";
import { assetTypeLabels } from "./labels";
import { appUrl, sendMail } from "./mail";
import { prisma } from "./prisma";

// Ponto único de escrita do que envolve responsável e termo.
//
// Trocar o responsável de uma máquina são quatro coisas que precisam
// acontecer juntas: encerrar o termo anterior, registrar a devolução,
// registrar a entrega e emitir o termo novo. Se uma delas ficasse na action e
// outra aqui, bastaria um caminho novo (a tela de detalhe, uma importação)
// esquecer uma para o histórico deixar de bater com a realidade.

type Tx = Prisma.TransactionClient;

// ===================== MODELO DO TERMO =====================

const TERM_TEMPLATE_KEY = "inventory_term_template";

export async function getTermTemplate(db: Tx = prisma): Promise<string> {
  const setting = await db.setting.findUnique({ where: { key: TERM_TEMPLATE_KEY } });
  const valor = setting?.value;
  return typeof valor === "string" && valor.trim() ? valor : DEFAULT_TERM_TEMPLATE;
}

/** `null` volta ao modelo padrão. */
export async function setTermTemplate(texto: string | null): Promise<void> {
  if (texto === null) {
    await prisma.setting.deleteMany({ where: { key: TERM_TEMPLATE_KEY } });
    return;
  }
  await prisma.setting.upsert({
    where: { key: TERM_TEMPLATE_KEY },
    update: { value: texto },
    create: { key: TERM_TEMPLATE_KEY, value: texto },
  });
}

export async function isDefaultTermTemplate(): Promise<boolean> {
  const setting = await prisma.setting.findUnique({
    where: { key: TERM_TEMPLATE_KEY },
    select: { key: true },
  });
  return !setting;
}

export function hashTermBody(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

// ===================== PATRIMÔNIO =====================

/** Valor provisório, trocado pelo definitivo na mesma transação. */
export function provisionalTag(): string {
  return `tmp-${randomBytes(8).toString("hex")}`;
}

/**
 * Patrimônio a partir do id. Se alguém já cadastrou esse número à mão para
 * outra máquina, acrescenta sufixo em vez de falhar o cadastro.
 */
export async function freeTag(tx: Tx, id: number): Promise<string> {
  const base = formatTag(id);
  let candidato = base;
  let n = 2;
  while (await tx.asset.findUnique({ where: { tag: candidato }, select: { id: true } })) {
    candidato = `${base}-${n}`;
    n += 1;
  }
  return candidato;
}

// ===================== TERMOS =====================

/** Emite o termo para o responsável atual, com o texto congelado. */
export async function issueTerm(
  tx: Tx,
  { assetId, userId, actorId }: { assetId: number; userId: number; actorId: number },
): Promise<number> {
  // Em sequência, não em Promise.all: dentro de uma transação tudo corre na
  // mesma conexão, e consultas simultâneas nela são rejeitadas pelo pg 9.
  const asset = await tx.asset.findUniqueOrThrow({
    where: { id: assetId },
    select: {
      tag: true,
      type: true,
      hostname: true,
      brand: true,
      model: true,
      serialNumber: true,
      processor: true,
      memory: true,
      storage: true,
      operatingSystem: true,
    },
  });
  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true, email: true, team: { select: { name: true } } },
  });
  const template = await getTermTemplate(tx);

  const body = renderTerm(template, {
    colaborador: user.name,
    email: user.email,
    setor: user.team?.name ?? null,
    asset,
    data: formatDate(new Date()),
  });

  const term = await tx.responsibilityTerm.create({
    data: {
      assetId,
      userId,
      issuedById: actorId,
      body,
      bodyHash: hashTermBody(body),
    },
    select: { id: true },
  });

  await tx.assetEvent.create({
    data: { assetId, actorId, type: "TERM_ISSUED", toValue: user.name },
  });

  return term.id;
}

/**
 * Encerra o que estiver vigente para a máquina: o termo ainda não assinado é
 * cancelado; o assinado é encerrado, mas continua guardado como prova do
 * período em que a pessoa ficou com o equipamento.
 */
export async function closeOpenTerms(tx: Tx, assetId: number, actorId: number): Promise<void> {
  const agora = new Date();

  const pendentes = await tx.responsibilityTerm.findMany({
    where: { assetId, status: "PENDING" },
    select: { id: true, user: { select: { name: true } } },
  });
  if (pendentes.length > 0) {
    await tx.responsibilityTerm.updateMany({
      where: { id: { in: pendentes.map((t) => t.id) } },
      data: { status: "CANCELLED", closedAt: agora },
    });
    await tx.assetEvent.createMany({
      data: pendentes.map((t) => ({
        assetId,
        actorId,
        type: "TERM_CANCELLED" as const,
        fromValue: t.user.name,
      })),
    });
  }

  await tx.responsibilityTerm.updateMany({
    where: { assetId, status: "SIGNED" },
    data: { status: "RETURNED", closedAt: agora },
  });
}

/**
 * Troca o responsável. Devolve o id do termo emitido, para quem chamou avisar
 * a pessoa depois que a transação confirmar — aviso dentro da transação
 * poderia sair para uma entrega que acabou desfeita.
 */
export async function changeAssignee(
  tx: Tx,
  {
    assetId,
    from,
    to,
    actorId,
  }: { assetId: number; from: number | null; to: number | null; actorId: number },
): Promise<number | null> {
  if (from === to) return null;

  await closeOpenTerms(tx, assetId, actorId);

  const nomes = await tx.user.findMany({
    where: { id: { in: [from, to].filter((v): v is number => v !== null) } },
    select: { id: true, name: true },
  });
  const nome = (id: number | null) => nomes.find((u) => u.id === id)?.name ?? null;

  if (from !== null) {
    await tx.assetEvent.create({
      data: { assetId, actorId, type: "RETURNED", fromValue: nome(from) },
    });
  }

  if (to === null) return null;

  await tx.assetEvent.create({
    data: { assetId, actorId, type: "ASSIGNED", fromValue: nome(from), toValue: nome(to) },
  });
  return issueTerm(tx, { assetId, userId: to, actorId });
}

// ===================== AVISOS =====================

export function termPath(termId: number): string {
  return `/termos/${termId}`;
}

/** Avisa o colaborador de que há um termo para ele assinar. */
export async function notifyTermIssued(termId: number): Promise<void> {
  const term = await prisma.responsibilityTerm.findUnique({
    where: { id: termId },
    select: {
      id: true,
      user: { select: { id: true, email: true, active: true } },
      asset: { select: { tag: true, type: true, hostname: true, brand: true, model: true } },
    },
  });
  if (!term || !term.user.active) return;

  const equipamento = `${assetTypeLabels[term.asset.type]} ${assetName(term.asset)} · ${term.asset.tag}`;

  await prisma.notification.create({
    data: {
      userId: term.user.id,
      type: "term.issued",
      title: "Termo de responsabilidade para assinar",
      body: equipamento,
      link: termPath(term.id),
    },
  });

  sendMail({
    to: term.user.email,
    subject: `[HelpDesk] Termo de responsabilidade — ${term.asset.tag}`,
    intro: "Um equipamento da empresa foi registrado no seu nome.",
    linhas: [
      { rotulo: "Equipamento", valor: `${assetTypeLabels[term.asset.type]} ${assetName(term.asset)}` },
      { rotulo: "Patrimônio", valor: term.asset.tag },
    ],
    citacao:
      "Confira os dados e assine o termo de responsabilidade. A assinatura é feita no próprio sistema, com o dedo ou o mouse, e leva menos de um minuto.",
    acaoUrl: appUrl(termPath(term.id)),
    acaoTexto: "Ler e assinar o termo",
    rodape: "Se este equipamento não está com você, responda avisando a TI.",
  });
}

/** Avisa a TI de que o termo foi assinado. Só pelo sino: não pede ação. */
export async function notifyTermSigned(termId: number): Promise<void> {
  const term = await prisma.responsibilityTerm.findUnique({
    where: { id: termId },
    select: {
      userId: true,
      assetId: true,
      user: { select: { name: true } },
      asset: { select: { tag: true } },
    },
  });
  if (!term) return;

  const admins = await prisma.user.findMany({
    where: {
      role: "ADMIN",
      active: true,
      id: { not: term.userId },
      email: { not: "integracao@sistema.local" },
    },
    select: { id: true },
  });
  if (admins.length === 0) return;

  await prisma.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      type: "term.signed",
      title: `Termo assinado — ${term.asset.tag}`,
      body: term.user.name,
      link: `/inventario/${term.assetId}`,
    })),
  });
}
