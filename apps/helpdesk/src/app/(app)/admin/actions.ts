"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { slugify } from "@/lib/slug";

// Cadastros de administração. Toda action revalida o papel contra a sessão do
// servidor — a tela esconder o botão nunca é a autorização, só a interface dela.

export interface AdminState {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: string;
}

function fail(error: z.ZodError): AdminState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0]);
    fieldErrors[key] ??= issue.message;
  }
  return { error: "Revise os campos destacados.", fieldErrors };
}

/** Gera um slug livre acrescentando sufixo, sem depender de tentativa e erro. */
async function freeSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const root = slugify(base) || "item";
  let candidate = root;
  let n = 2;
  while (await exists(candidate)) {
    candidate = `${root}-${n}`;
    n += 1;
  }
  return candidate;
}

// ===================== USUÁRIOS =====================

const userSchema = z.object({
  name: z.string().trim().min(3, "Informe o nome completo").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  role: z.enum(["ADMIN", "USER"]),
  teamId: z
    .string()
    .optional()
    .transform((v) => (v && v !== "" ? Number(v) : null)),
  phone: z.string().trim().max(40).optional(),
  active: z.boolean(),
});

export async function createUserAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  await requireAdmin();

  const parsed = userSchema
    .extend({
      password: z.string().min(8, "A senha precisa de pelo menos 8 caracteres"),
    })
    .safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      role: formData.get("role"),
      teamId: formData.get("teamId") ?? undefined,
      phone: formData.get("phone") ?? undefined,
      active: formData.get("active") === "on",
      password: formData.get("password"),
    });

  if (!parsed.success) return fail(parsed.error);

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });
  if (existing) {
    return { error: "Já existe um usuário com este e-mail.", fieldErrors: { email: "E-mail em uso" } };
  }

  await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      teamId: parsed.data.teamId,
      phone: parsed.data.phone || null,
      active: parsed.data.active,
      passwordHash: await hashPassword(parsed.data.password),
    },
  });

  revalidatePath("/admin/usuarios");
  return { ok: `Usuário ${parsed.data.name} criado.` };
}

export async function updateUserAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const admin = await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { error: "Usuário inválido." };

  const parsed = userSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
    teamId: formData.get("teamId") ?? undefined,
    phone: formData.get("phone") ?? undefined,
    active: formData.get("active") === "on",
  });
  if (!parsed.success) return fail(parsed.error);

  // Trava contra o administrador se trancar para fora: se ele se rebaixar ou
  // se desativar sendo o último ADMIN ativo, ninguém consegue mais administrar
  // o sistema — e a recuperação exigiria acesso ao banco.
  const losingAdmin =
    id === admin.id && (parsed.data.role !== "ADMIN" || !parsed.data.active);
  if (losingAdmin) {
    const otherAdmins = await prisma.user.count({
      where: { role: "ADMIN", active: true, id: { not: id } },
    });
    if (otherAdmins === 0) {
      return {
        error:
          "Você é o único administrador ativo. Promova outra pessoa antes de mudar seu próprio acesso.",
      };
    }
  }

  const emailOwner = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });
  if (emailOwner && emailOwner.id !== id) {
    return { error: "Já existe um usuário com este e-mail.", fieldErrors: { email: "E-mail em uso" } };
  }

  await prisma.user.update({
    where: { id },
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      teamId: parsed.data.teamId,
      phone: parsed.data.phone || null,
      active: parsed.data.active,
    },
  });

  revalidatePath("/admin/usuarios");
  revalidatePath(`/admin/usuarios/${id}`);
  return { ok: "Alterações salvas." };
}

export async function resetPasswordAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  await requireAdmin();

  const id = Number(formData.get("id"));
  const password = String(formData.get("password") ?? "");
  if (!Number.isInteger(id) || id <= 0) return { error: "Usuário inválido." };
  if (password.length < 8) {
    return { error: "A senha precisa de pelo menos 8 caracteres." };
  }

  await prisma.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(password) },
  });

  revalidatePath(`/admin/usuarios/${id}`);
  return { ok: "Senha redefinida. Avise a pessoa pelo canal combinado." };
}

// ===================== SETORES =====================

const teamSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do setor").max(80),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("E-mail inválido")
    .optional()
    .or(z.literal("")),
  description: z.string().trim().max(200).optional(),
  active: z.boolean(),
});

export async function createTeamAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  await requireAdmin();

  const parsed = teamSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email") ?? undefined,
    description: formData.get("description") ?? undefined,
    active: formData.get("active") === "on",
  });
  if (!parsed.success) return fail(parsed.error);

  const slug = await freeSlug(parsed.data.name, async (s) =>
    Boolean(await prisma.team.findUnique({ where: { slug: s }, select: { id: true } })),
  );

  await prisma.team.create({
    data: {
      name: parsed.data.name,
      slug,
      email: parsed.data.email || null,
      description: parsed.data.description || null,
      active: parsed.data.active,
    },
  });

  revalidatePath("/admin/setores");
  return { ok: `Setor ${parsed.data.name} criado.` };
}

export async function updateTeamAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { error: "Setor inválido." };

  const parsed = teamSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email") ?? undefined,
    description: formData.get("description") ?? undefined,
    active: formData.get("active") === "on",
  });
  if (!parsed.success) return fail(parsed.error);

  // Desativar um setor que ainda tem fila esconderia chamados vivos do
  // roteamento sem que ninguém percebesse.
  if (!parsed.data.active) {
    const abertos = await prisma.ticket.count({
      where: {
        teamId: id,
        status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED"] },
      },
    });
    if (abertos > 0) {
      return {
        error: `Este setor ainda tem ${abertos} ${abertos === 1 ? "chamado" : "chamados"} em aberto. Encerre ou transfira antes de desativar.`,
      };
    }
  }

  await prisma.team.update({
    where: { id },
    data: {
      name: parsed.data.name,
      email: parsed.data.email || null,
      description: parsed.data.description || null,
      active: parsed.data.active,
    },
  });

  revalidatePath("/admin/setores");
  return { ok: "Alterações salvas." };
}

// ===================== CATEGORIAS =====================

const categorySchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da categoria").max(80),
  teamId: z
    .string()
    .optional()
    .transform((v) => (v && v !== "" ? Number(v) : null)),
  defaultType: z.enum(["SUPPORT", "INCIDENT", "CHANGE_REQUEST", "IMPROVEMENT", "TASK"]),
  description: z.string().trim().max(200).optional(),
  active: z.boolean(),
});

export async function createCategoryAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  await requireAdmin();

  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    teamId: formData.get("teamId") ?? undefined,
    defaultType: formData.get("defaultType"),
    description: formData.get("description") ?? undefined,
    active: formData.get("active") === "on",
  });
  if (!parsed.success) return fail(parsed.error);

  const slug = await freeSlug(parsed.data.name, async (s) =>
    Boolean(await prisma.category.findUnique({ where: { slug: s }, select: { id: true } })),
  );

  await prisma.category.create({
    data: {
      name: parsed.data.name,
      slug,
      teamId: parsed.data.teamId,
      defaultType: parsed.data.defaultType,
      description: parsed.data.description || null,
      active: parsed.data.active,
    },
  });

  revalidatePath("/admin/categorias");
  return { ok: `Categoria ${parsed.data.name} criada.` };
}

export async function updateCategoryAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { error: "Categoria inválida." };

  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    teamId: formData.get("teamId") ?? undefined,
    defaultType: formData.get("defaultType"),
    description: formData.get("description") ?? undefined,
    active: formData.get("active") === "on",
  });
  if (!parsed.success) return fail(parsed.error);

  await prisma.category.update({
    where: { id },
    data: {
      name: parsed.data.name,
      teamId: parsed.data.teamId,
      defaultType: parsed.data.defaultType,
      description: parsed.data.description || null,
      active: parsed.data.active,
    },
  });

  revalidatePath("/admin/categorias");
  return { ok: "Alterações salvas." };
}

/** Volta para a lista depois de salvar, usado pelos botões de cancelar. */
export async function backToList(path: string): Promise<never> {
  redirect(path);
}
