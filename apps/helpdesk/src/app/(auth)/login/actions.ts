"use server";

import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn } from "@/lib/auth";

const schema = z.object({
  email: z.string().min(1, "Informe o e-mail").email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
});

export interface LoginState {
  error?: string;
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  // Só aceita destino interno: um `next` vindo da URL não pode virar
  // redirecionamento para fora do sistema.
  const requested = String(formData.get("next") ?? "");
  const redirectTo =
    requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";

  try {
    await signIn("credentials", { ...parsed.data, redirectTo });
  } catch (error) {
    // signIn sinaliza sucesso lançando um redirect; só o AuthError é falha
    // de verdade, e qualquer outra coisa precisa continuar subindo.
    if (error instanceof AuthError) {
      return { error: "E-mail ou senha incorretos." };
    }
    throw error;
  }

  return {};
}
