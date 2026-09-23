"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { AdminState } from "@/app/(app)/admin/actions";
import {
  changeAssignee,
  closeOpenTerms,
  freeTag,
  issueTerm,
  notifyTermIssued,
  provisionalTag,
  setTermTemplate,
} from "@/lib/assets";
import { reconcileAssignment } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { deleteUpload, isImage, storeUploads, type StoredFile } from "@/lib/storage";

// Inventário de equipamentos. Só a TI cadastra e altera; cada action revalida
// o papel pela sessão do servidor, independentemente do que a tela mostra.

function fail(error: z.ZodError): AdminState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0]);
    fieldErrors[key] ??= issue.message;
  }
  return { error: "Revise os campos destacados.", fieldErrors };
}

function idFrom(formData: FormData, key = "id"): number | null {
  const id = Number(formData.get(key));
  return Number.isInteger(id) && id > 0 ? id : null;
}

// ---------- Campos ----------

const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres`)
    .optional()
    .transform((v) => v || null);

const idOpcional = z
  .string()
  .optional()
  .transform((v) => (v && v !== "" ? Number(v) : null))
  .refine((v) => v === null || (Number.isInteger(v) && v > 0), "Valor inválido");

/**
 * Data de <input type="date"> ("2026-09-23"). Gravada ao meio-dia UTC: à
 * meia-noite, o fuso de São Paulo a exibiria como o dia anterior.
 */
const dataOpcional = z
  .string()
  .optional()
  .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Data inválida")
  .transform((v) => (v ? new Date(`${v}T12:00:00Z`) : null));

const assetSchema = z.object({
  type: z.enum(["DESKTOP", "NOTEBOOK", "MONITOR", "PRINTER", "PHONE", "TABLET", "NETWORK", "OTHER"], {
    message: "Escolha o tipo",
  }),
  status: z.enum(["IN_USE", "IN_STOCK", "MAINTENANCE", "RETIRED"]),
  tag: z
    .string()
    .trim()
    .toUpperCase()
    .max(40, "Máximo de 40 caracteres")
    .refine((v) => !v.toLowerCase().startsWith("tmp-"), "Prefixo reservado")
    .optional()
    .transform((v) => v || null),
  hostname: texto(80),
  brand: texto(80),
  model: texto(120),
  serialNumber: texto(120),
  processor: texto(120),
  memory: texto(60),
  storage: texto(120),
  operatingSystem: texto(80),
  ipAddress: texto(60),
  macAddress: texto(60),
  remoteAccess: texto(60),
  location: texto(120),
  notes: texto(5000),
  teamId: idOpcional,
  assigneeId: idOpcional,
  purchasedAt: dataOpcional,
  warrantyUntil: dataOpcional,
});

type AssetInput = z.infer<typeof assetSchema>;

const FIELDS = Object.keys(assetSchema.shape) as Array<keyof AssetInput>;

/** Rótulos usados no histórico ("alterou memória e sistema"). */
const FIELD_LABELS: Record<keyof AssetInput, string> = {
  type: "tipo",
  status: "situação",
  tag: "patrimônio",
  hostname: "nome na rede",
  brand: "marca",
  model: "modelo",
  serialNumber: "nº de série",
  processor: "processador",
  memory: "memória",
  storage: "armazenamento",
  operatingSystem: "sistema",
  ipAddress: "IP",
  macAddress: "MAC",
  remoteAccess: "acesso remoto",
  location: "local",
  notes: "observações",
  teamId: "setor",
  assigneeId: "responsável",
  purchasedAt: "data de compra",
  warrantyUntil: "garantia",
};

function parseAsset(formData: FormData) {
  // Um campo que não veio no formulário (ex.: processador de um monitor, que
  // a tela nem mostra) chega como null e é tratado como vazio.
  const raw = Object.fromEntries(FIELDS.map((k) => [k, formData.get(k) ?? undefined]));
  return assetSchema.safeParse(raw);
}

/** Confere as referências antes de gravar, com mensagem no campo certo. */
async function checkReferences(data: AssetInput): Promise<AdminState | null> {
  const [team, assignee] = await Promise.all([
    data.teamId
      ? prisma.team.findUnique({ where: { id: data.teamId }, select: { id: true } })
      : null,
    data.assigneeId
      ? prisma.user.findUnique({ where: { id: data.assigneeId }, select: { active: true } })
      : null,
  ]);
  if (data.teamId && !team) {
    return { error: "Setor não encontrado.", fieldErrors: { teamId: "Setor inválido" } };
  }
  if (data.assigneeId && !assignee?.active) {
    return {
      error: "O responsável precisa ser uma conta ativa.",
      fieldErrors: { assigneeId: "Conta inativa ou inexistente" },
    };
  }
  return null;
}

async function tagInUse(tag: string, exceptId?: number): Promise<boolean> {
  const dono = await prisma.asset.findUnique({ where: { tag }, select: { id: true } });
  return Boolean(dono && dono.id !== exceptId);
}

/** Separa as fotos: só imagem entra, o resto é recusado com motivo. */
async function storePhotos(formData: FormData) {
  const arquivos = formData
    .getAll("fotos")
    .filter((f): f is File => f instanceof File && f.size > 0);
  const naoImagens = arquivos.filter((f) => !isImage(f.type));
  const { stored, rejected } = await storeUploads(arquivos.filter((f) => isImage(f.type)));
  return {
    stored,
    rejected: [
      ...rejected,
      ...naoImagens.map((f) => ({ filename: f.name, reason: "não é imagem" })),
    ],
  };
}

function photoRows(assetId: number, userId: number, stored: StoredFile[]) {
  return stored.map((f) => ({
    assetId,
    uploadedById: userId,
    filename: f.filename,
    mimeType: f.mimeType,
    sizeBytes: f.sizeBytes,
    storageKey: f.storageKey,
  }));
}

function revalidateInventory(assetId?: number) {
  revalidatePath("/inventario");
  revalidatePath("/meus-equipamentos");
  if (assetId) revalidatePath(`/inventario/${assetId}`);
}

// ===================== CADASTRO =====================

export async function createAssetAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const admin = await requireAdmin();

  const parsed = parseAsset(formData);
  if (!parsed.success) return fail(parsed.error);

  const data = { ...parsed.data, ...reconcileAssignment(parsed.data) };

  const refError = await checkReferences(data);
  if (refError) return refError;
  if (data.tag && (await tagInUse(data.tag))) {
    return {
      error: `Já existe um equipamento com o patrimônio ${data.tag}.`,
      fieldErrors: { tag: "Patrimônio em uso" },
    };
  }

  // Fotos gravadas antes da transação; se ela falhar, são apagadas no catch
  // para não sobrar arquivo órfão no disco.
  const { stored, rejected } = await storePhotos(formData);

  let resultado: { id: number; termId: number | null };
  try {
    resultado = await prisma.$transaction(async (tx) => {
      const { assigneeId, tag, ...campos } = data;

      const asset = await tx.asset.create({
        data: {
          ...campos,
          tag: tag ?? provisionalTag(),
          // Cadastrar olhando para a máquina já é uma conferência.
          lastCheckedAt: new Date(),
        },
        select: { id: true },
      });

      if (!tag) {
        await tx.asset.update({
          where: { id: asset.id },
          data: { tag: await freeTag(tx, asset.id) },
        });
      }

      await tx.assetEvent.create({
        data: { assetId: asset.id, actorId: admin.id, type: "CREATED" },
      });

      if (stored.length > 0) {
        await tx.assetPhoto.createMany({ data: photoRows(asset.id, admin.id, stored) });
      }

      // A entrega passa pelo mesmo caminho da troca de responsável: gera o
      // evento e o termo. O responsável só é gravado depois, porque
      // changeAssignee parte do estado "sem ninguém".
      let termId: number | null = null;
      if (assigneeId) {
        await tx.asset.update({ where: { id: asset.id }, data: { assigneeId } });
        termId = await changeAssignee(tx, {
          assetId: asset.id,
          from: null,
          to: assigneeId,
          actorId: admin.id,
        });
      }

      return { id: asset.id, termId };
    });
  } catch (error) {
    await Promise.all(stored.map((f) => deleteUpload(f.storageKey)));
    console.error("[inventario] falha ao cadastrar:", error);
    return { error: "Não foi possível salvar o equipamento. Tente de novo." };
  }

  if (resultado.termId) await notifyTermIssued(resultado.termId);

  revalidateInventory();
  redirect(
    `/inventario/${resultado.id}?novo=1${rejected.length > 0 ? `&recusadas=${rejected.length}` : ""}`,
  );
}

export async function updateAssetAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const admin = await requireAdmin();
  const id = idFrom(formData);
  if (!id) return { error: "Equipamento inválido." };

  const parsed = parseAsset(formData);
  if (!parsed.success) return fail(parsed.error);

  const antes = await prisma.asset.findUnique({ where: { id } });
  if (!antes) return { error: "Equipamento não encontrado." };

  const data = { ...parsed.data, ...reconcileAssignment(parsed.data) };
  // Patrimônio em branco na edição mantém o atual: apagar o número da
  // etiqueta não faz sentido, e gerar outro trocaria a identidade da máquina.
  const tag = data.tag ?? antes.tag;

  const refError = await checkReferences(data);
  if (refError) return refError;
  if (await tagInUse(tag, id)) {
    return {
      error: `Já existe um equipamento com o patrimônio ${tag}.`,
      fieldErrors: { tag: "Patrimônio em uso" },
    };
  }

  const alterados = FIELDS.filter((k) => {
    if (k === "status" || k === "assigneeId") return false;
    const novo = k === "tag" ? tag : data[k];
    const velho = antes[k];
    if (novo instanceof Date || velho instanceof Date) {
      return (novo as Date | null)?.getTime() !== (velho as Date | null)?.getTime();
    }
    return (novo ?? null) !== (velho ?? null);
  });

  let termId: number | null = null;
  try {
    termId = await prisma.$transaction(async (tx) => {
      const { assigneeId, ...campos } = data;
      await tx.asset.update({ where: { id }, data: { ...campos, tag, assigneeId } });

      if (antes.status !== data.status) {
        await tx.assetEvent.create({
          data: {
            assetId: id,
            actorId: admin.id,
            type: "STATUS_CHANGED",
            fromValue: antes.status,
            toValue: data.status,
          },
        });
      }

      if (alterados.length > 0) {
        await tx.assetEvent.create({
          data: {
            assetId: id,
            actorId: admin.id,
            type: "UPDATED",
            note: alterados.map((k) => FIELD_LABELS[k]).join(", "),
          },
        });
      }

      return changeAssignee(tx, {
        assetId: id,
        from: antes.assigneeId,
        to: assigneeId,
        actorId: admin.id,
      });
    });
  } catch (error) {
    console.error("[inventario] falha ao salvar:", error);
    return { error: "Não foi possível salvar as alterações. Tente de novo." };
  }

  if (termId) await notifyTermIssued(termId);

  revalidateInventory(id);
  redirect(`/inventario/${id}`);
}

// ===================== AÇÕES RÁPIDAS DO DETALHE =====================

/** Troca o responsável sem abrir o formulário inteiro. Vazio = devolução. */
export async function assignAssetAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = idFrom(formData);
  if (!id) return;

  const para = idFrom(formData, "assigneeId");
  const antes = await prisma.asset.findUnique({
    where: { id },
    select: { status: true, assigneeId: true },
  });
  if (!antes) return;

  if (para) {
    const pessoa = await prisma.user.findUnique({ where: { id: para }, select: { active: true } });
    if (!pessoa?.active) return;
  }

  // Um equipamento baixado volta a circular ao ser entregue de novo.
  const base = antes.status === "RETIRED" && para ? "IN_USE" : antes.status;
  const novo = reconcileAssignment({ status: base, assigneeId: para });

  const termId = await prisma.$transaction(async (tx) => {
    await tx.asset.update({
      where: { id },
      data: { assigneeId: novo.assigneeId, status: novo.status },
    });
    if (novo.status !== antes.status) {
      await tx.assetEvent.create({
        data: {
          assetId: id,
          actorId: admin.id,
          type: "STATUS_CHANGED",
          fromValue: antes.status,
          toValue: novo.status,
        },
      });
    }
    return changeAssignee(tx, {
      assetId: id,
      from: antes.assigneeId,
      to: novo.assigneeId,
      actorId: admin.id,
    });
  });

  if (termId) await notifyTermIssued(termId);
  revalidateInventory(id);
}

/**
 * Emite um termo novo para o mesmo responsável. Serve para quando a
 * configuração mudou (troca de disco, memória) ou o modelo do termo foi
 * revisado: o anterior é encerrado e o novo precisa de nova assinatura.
 */
export async function reissueTermAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = idFrom(formData);
  if (!id) return;

  const asset = await prisma.asset.findUnique({ where: { id }, select: { assigneeId: true } });
  if (!asset?.assigneeId) return;
  const userId = asset.assigneeId;

  const termId = await prisma.$transaction(async (tx) => {
    await closeOpenTerms(tx, id, admin.id);
    return issueTerm(tx, { assetId: id, userId, actorId: admin.id });
  });

  await notifyTermIssued(termId);
  revalidateInventory(id);
}

export async function markCheckedAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = idFrom(formData);
  if (!id) return;

  const nota = String(formData.get("nota") ?? "").trim().slice(0, 500) || null;

  await prisma.$transaction([
    prisma.asset.update({ where: { id }, data: { lastCheckedAt: new Date() } }),
    prisma.assetEvent.create({
      data: { assetId: id, actorId: admin.id, type: "CHECKED", note: nota },
    }),
  ]);

  revalidateInventory(id);
}

export interface PhotoState {
  ok?: string;
  error?: string;
}

export async function addPhotosAction(
  _prev: PhotoState,
  formData: FormData,
): Promise<PhotoState> {
  const admin = await requireAdmin();
  const id = idFrom(formData);
  if (!id) return { error: "Equipamento inválido." };

  const existe = await prisma.asset.findUnique({ where: { id }, select: { id: true } });
  if (!existe) return { error: "Equipamento não encontrado." };

  const { stored, rejected } = await storePhotos(formData);
  if (stored.length === 0) {
    return {
      error:
        rejected.length > 0
          ? `Foto recusada: ${rejected.map((r) => `${r.filename} (${r.reason})`).join("; ")}.`
          : "Nenhuma foto recebida.",
    };
  }

  await prisma.$transaction([
    prisma.assetPhoto.createMany({ data: photoRows(id, admin.id, stored) }),
    prisma.assetEvent.create({
      data: {
        assetId: id,
        actorId: admin.id,
        type: "PHOTO_ADDED",
        toValue: String(stored.length),
      },
    }),
  ]);

  revalidateInventory(id);
  return {
    ok: stored.length === 1 ? "Foto adicionada." : `${stored.length} fotos adicionadas.`,
    error:
      rejected.length > 0
        ? `Recusadas: ${rejected.map((r) => `${r.filename} (${r.reason})`).join("; ")}.`
        : undefined,
  };
}

export async function deletePhotoAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const photoId = idFrom(formData, "photoId");
  if (!photoId) return;

  const foto = await prisma.assetPhoto.findUnique({
    where: { id: photoId },
    select: { assetId: true, storageKey: true },
  });
  if (!foto) return;

  await prisma.$transaction([
    prisma.assetPhoto.delete({ where: { id: photoId } }),
    prisma.assetEvent.create({
      data: { assetId: foto.assetId, actorId: admin.id, type: "PHOTO_REMOVED" },
    }),
  ]);
  // O arquivo sai depois do registro: se a exclusão no banco falhar, a foto
  // continua íntegra em vez de virar um registro apontando para o nada.
  await deleteUpload(foto.storageKey);

  revalidateInventory(foto.assetId);
}

// ===================== MODELO DO TERMO =====================

export async function saveTermTemplateAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  await requireAdmin();

  if (formData.get("restaurar") === "1") {
    await setTermTemplate(null);
    revalidatePath("/inventario/termo");
    return { ok: "Modelo padrão restaurado." };
  }

  const texto = String(formData.get("template") ?? "").replace(/\r\n/g, "\n").trim();
  if (texto.length < 50) {
    return { error: "O termo ficou curto demais.", fieldErrors: { template: "Texto muito curto" } };
  }
  if (texto.length > 20_000) {
    return { error: "O termo passou de 20 mil caracteres.", fieldErrors: { template: "Texto muito longo" } };
  }
  if (!texto.includes("{{colaborador}}") || !texto.includes("{{equipamento}}")) {
    return {
      error: "O modelo precisa de {{colaborador}} e {{equipamento}} — sem eles, o termo não identifica quem recebe nem o quê.",
      fieldErrors: { template: "Faltam chaves obrigatórias" },
    };
  }

  await setTermTemplate(texto);
  revalidatePath("/inventario/termo");
  return { ok: "Modelo salvo. Vale para os próximos termos emitidos." };
}

