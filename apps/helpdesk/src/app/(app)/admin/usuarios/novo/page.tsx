import type { Metadata } from "next";
import { UserForm } from "@/components/admin/user-form";
import { PageHeader } from "@/components/ui/misc";
import { Section } from "@/components/ui/section";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Novo usuário" };
export const dynamic = "force-dynamic";

export default async function NewUserPage() {
  const teams = await prisma.team.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Novo usuário" />
      <Section title="Dados da conta">
        <UserForm teams={teams} />
      </Section>
    </div>
  );
}
