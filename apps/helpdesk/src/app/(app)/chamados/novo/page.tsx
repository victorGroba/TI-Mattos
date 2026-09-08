import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { TicketForm } from "./ticket-form";

export const metadata: Metadata = { title: "Abrir chamado" };
export const dynamic = "force-dynamic";

export default async function NewTicketPage() {
  const user = await requireUser("/chamados/novo");

  // O setor de quem pede vem do cadastro — mostrado, nunca perguntado.
  const dados = await prisma.user.findUnique({
    where: { id: user.id },
    select: { team: { select: { name: true } } },
  });

  return (
    <div className="mx-auto w-full max-w-2xl space-y-7 py-2">
      <PageHeader
        title="Abrir chamado"
        description="A TI recebe e responde por aqui mesmo"
      />
      <TicketForm setorDoUsuario={dados?.team?.name ?? null} />
    </div>
  );
}
