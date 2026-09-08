import Image from "next/image";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Quem já está autenticado não deveria ver a tela de login de novo.
  if (await getSessionUser()) redirect("/");

  const { next } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image
            src="/logo.png"
            alt="Mattos &amp; Mattos TI"
            width={132}
            height={132}
            priority
            className="mb-3 rounded-lg dark:bg-white/90 dark:p-1.5"
          />
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            HelpDesk
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Suporte técnico e demandas de projeto
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-6 shadow-[var(--shadow-card)]">
          <LoginForm next={next} />
        </div>

        <p className="mt-6 text-center text-xs text-subtle-foreground">
          Problemas para entrar? Fale com a TI em{" "}
          <a
            href="mailto:ti@labmattos.com.br"
            className="text-primary underline-offset-4 hover:underline"
          >
            ti@labmattos.com.br
          </a>
        </p>
      </div>
    </main>
  );
}
