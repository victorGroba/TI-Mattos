"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import { getDefaultTeamId } from "@/lib/settings";
import { storeUploads } from "@/lib/storage";
import { addComment, assignTicket, changeStatus, createTicket } from "@/lib/tickets";

// Toda action revalida a permissão contra a sessão do servidor. O que a tela
// mostrou (ou escondeu) nunca é a autorização — só a interface dela.

const optionalId = z
  .string()
  .optional()
  .transform((v) => (v && v !== "" ? Number(v) : null))
  .refine((v) => v === null || Number.isInteger(v), "Valor inválido");

// ---------- Abertura ----------

const createSchema = z.object({
  title: z.string().trim().min(4, "Descreva o assunto em pelo menos 4 caracteres").max(200),
  description: z.string().trim().min(10, "Detalhe o pedido em pelo menos 10 caracteres"),
  type: z.enum(["SUPPORT", "INCIDENT", "CHANGE_REQUEST", "IMPROVEMENT", "TASK"]),
  categoryId: optionalId,
});

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Arquivos recusados no envio, para a tela dizer qual e por quê. */
  rejected?: Array<{ filename: string; reason: string }>;
}

export async function createTicketAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const parsed = createSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    type: formData.get("type"),
    categoryId: formData.get("categoryId") ?? undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      fieldErrors[key] ??= issue.message;
    }
    return { error: "Revise os campos destacados.", fieldErrors };
  }

  const data = parsed.data;

  // Ninguém escolhe prioridade nem setor na abertura.
  //
  // Prioridade perguntada ao solicitante vira sempre "urgente" e deixa de
  // ordenar coisa alguma; ela nasce média e a triagem ajusta. O setor que
  // atende é sempre o mesmo (a TI) e o setor de quem pede já está no cadastro
  // da pessoa — perguntar seria pedir que ela adivinhasse a estrutura interna.
  const teamId = await getDefaultTeamId();

  // Anexos: gravados antes de criar o chamado só se houver arquivo, para não
  // deixar arquivo órfão em disco caso a criação falhe logo em seguida.
  const arquivos = formData.getAll("anexos").filter((f): f is File => f instanceof File);
  const { stored, rejected } = await storeUploads(arquivos);

  let ticket;
  try {
    ticket = await createTicket({
      title: data.title,
      description: data.description,
      type: data.type,
      priority: "MEDIUM",
      categoryId: data.categoryId,
      teamId,
      requesterId: user.id,
      source: "WEB",
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Não foi possível abrir o chamado.",
      rejected: rejected.length > 0 ? rejected : undefined,
    };
  }

  if (stored.length > 0) {
    await prisma.attachment.createMany({
      data: stored.map((f) => ({
        ticketId: ticket.id,
        uploadedById: user.id,
        filename: f.filename,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes,
        storageKey: f.storageKey,
      })),
    });
    await prisma.ticketEvent.create({
      data: {
        ticketId: ticket.id,
        actorId: user.id,
        type: "ATTACHMENT_ADDED",
        metadata: { quantidade: stored.length },
      },
    });
  }

  revalidatePath("/chamados");
  revalidatePath("/meus-chamados");
  redirect(`/chamados/${ticket.id}`);
}

// ---------- Projeto ----------

/** Vincula o chamado a um projeto. É decisão de triagem, só do administrador. */
export async function setProjectAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!isAdmin(user.role)) return;

  const ticketId = Number(formData.get("ticketId"));
  const raw = String(formData.get("projectId") ?? "");
  if (!Number.isInteger(ticketId) || ticketId <= 0) return;

  const projectId = raw === "" ? null : Number(raw);
  if (projectId !== null && !Number.isInteger(projectId)) return;

  const atual = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { projectId: true },
  });
  if (!atual || atual.projectId === projectId) return;

  await prisma.$transaction([
    prisma.ticket.update({ where: { id: ticketId }, data: { projectId } }),
    prisma.ticketEvent.create({
      data: {
        ticketId,
        actorId: user.id,
        type: "PROJECT_CHANGED",
        field: "projectId",
        fromValue: atual.projectId ? String(atual.projectId) : null,
        toValue: projectId ? String(projectId) : null,
      },
    }),
  ]);

  revalidatePath(`/chamados/${ticketId}`);
  revalidatePath("/projetos");
}

// ---------- Respostas ----------

const commentSchema = z.object({
  ticketId: z.coerce.number().int().positive(),
  body: z.string().trim().min(1, "A resposta não pode ficar vazia"),
  internal: z.boolean(),
});

export async function addCommentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const parsed = commentSchema.safeParse({
    ticketId: formData.get("ticketId"),
    body: formData.get("body"),
    // Nota interna só existe para o administrador; vinda de outro papel, é ignorada.
    internal: formData.get("internal") === "on" && isAdmin(user.role),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: parsed.data.ticketId },
    select: { requesterId: true },
  });
  if (!ticket) return { error: "Chamado não encontrado." };

  if (!isAdmin(user.role) && ticket.requesterId !== user.id) {
    return { error: "Você não tem acesso a este chamado." };
  }

  const comment = await addComment({
    ticketId: parsed.data.ticketId,
    authorId: user.id,
    body: parsed.data.body,
    internal: parsed.data.internal,
  });

  const arquivos = formData.getAll("anexos").filter((f): f is File => f instanceof File);
  const { stored, rejected } = await storeUploads(arquivos);

  if (stored.length > 0) {
    // Vinculados ao comentário E ao chamado: aparecem junto da mensagem na
    // conversa e também na lista geral de anexos do chamado.
    await prisma.attachment.createMany({
      data: stored.map((f) => ({
        ticketId: parsed.data.ticketId,
        commentId: comment.id,
        uploadedById: user.id,
        filename: f.filename,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes,
        storageKey: f.storageKey,
      })),
    });
  }

  revalidatePath(`/chamados/${parsed.data.ticketId}`);
  return rejected.length > 0 ? { rejected } : {};
}

// ---------- Status ----------

const statusSchema = z.object({
  ticketId: z.coerce.number().int().positive(),
  status: z.enum([
    "OPEN",
    "TRIAGED",
    "IN_PROGRESS",
    "WAITING_REQUESTER",
    "WAITING_THIRD_PARTY",
    "IN_REVIEW",
    "RESOLVED",
    "CLOSED",
    "CANCELLED",
  ]),
});

export async function changeStatusAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = statusSchema.safeParse({
    ticketId: formData.get("ticketId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return;

  const ticket = await prisma.ticket.findUnique({
    where: { id: parsed.data.ticketId },
    select: { requesterId: true, status: true },
  });
  if (!ticket) return;

  // Quem abriu pode encerrar ou reabrir o próprio chamado; o resto do fluxo
  // pertence ao administrador.
  const allowedForRequester = ["CLOSED", "OPEN"];
  if (
    !isAdmin(user.role) &&
    (ticket.requesterId !== user.id || !allowedForRequester.includes(parsed.data.status))
  ) {
    return;
  }

  await changeStatus(parsed.data.ticketId, parsed.data.status, user.id);
  revalidatePath(`/chamados/${parsed.data.ticketId}`);
  revalidatePath("/chamados");
}

// ---------- Responsável ----------

export async function assignAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!isAdmin(user.role)) return;

  const ticketId = Number(formData.get("ticketId"));
  const raw = String(formData.get("assigneeId") ?? "");
  if (!Number.isInteger(ticketId) || ticketId <= 0) return;

  // "eu" é o botão de pegar o chamado para si — o caminho mais comum.
  const assigneeId = raw === "eu" ? user.id : raw === "" ? null : Number(raw);
  if (assigneeId !== null && !Number.isInteger(assigneeId)) return;

  await assignTicket(ticketId, assigneeId, user.id);
  revalidatePath(`/chamados/${ticketId}`);
  revalidatePath("/chamados");
}

// ---------- Arquivamento ----------

/**
 * Arquiva ou desarquiva um chamado. Só o administrador, e sempre reversível:
 * arquivar tira da vista e das métricas, mas não apaga nada.
 */
export async function toggleArchiveAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!isAdmin(user.role)) return;

  const ticketId = Number(formData.get("ticketId"));
  if (!Number.isInteger(ticketId) || ticketId <= 0) return;

  const atual = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { archivedAt: true },
  });
  if (!atual) return;

  const arquivando = atual.archivedAt === null;

  await prisma.$transaction([
    prisma.ticket.update({
      where: { id: ticketId },
      data: { archivedAt: arquivando ? new Date() : null },
    }),
    prisma.ticketEvent.create({
      data: {
        ticketId,
        actorId: user.id,
        type: "STATUS_CHANGED",
        field: "archivedAt",
        toValue: arquivando ? "arquivado" : "reaberto para a fila",
      },
    }),
  ]);

  revalidatePath(`/chamados/${ticketId}`);
  revalidatePath("/chamados");
}

// ---------- Apontamento de horas ----------

const timeSchema = z.object({
  ticketId: z.coerce.number().int().positive(),
  minutes: z.coerce
    .number()
    .int()
    .positive("Informe quantos minutos foram gastos")
    .max(24 * 60, "Aponte no máximo 24 horas por lançamento"),
  note: z.string().trim().max(280).optional(),
});

export async function logTimeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!isAdmin(user.role)) return { error: "Sem permissão." };

  const parsed = timeSchema.safeParse({
    ticketId: formData.get("ticketId"),
    minutes: formData.get("minutes"),
    note: formData.get("note") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  await prisma.$transaction([
    prisma.timeEntry.create({
      data: {
        ticketId: parsed.data.ticketId,
        userId: user.id,
        minutes: parsed.data.minutes,
        note: parsed.data.note || null,
      },
    }),
    prisma.ticketEvent.create({
      data: {
        ticketId: parsed.data.ticketId,
        actorId: user.id,
        type: "TIME_LOGGED",
        metadata: { minutes: parsed.data.minutes },
      },
    }),
  ]);

  revalidatePath(`/chamados/${parsed.data.ticketId}`);
  return {};
}
