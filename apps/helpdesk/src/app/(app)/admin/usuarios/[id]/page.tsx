import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/admin/reset-password-form";
import { UserForm } from "@/components/admin/user-form";
import { PageHeader } from "@/components/ui/misc";
import { Section } from "@/components/ui/section";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id: Number(id) || 0 },
    select: { name: true },
  });
  return { title: user?.name ?? "Usuário" };
}

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = Number(id);
  if (!Number.isInteger(userId) || userId <= 0) notFound();

  const [user, teams] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        teamId: true,
        phone: true,
        active: true,
        lastLogin: true,
        createdAt: true,
        passwordHash: true,
        _count: { select: { assignedTickets: true, requestedTickets: true } },
      },
    }),
    prisma.team.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!user) notFound();

  // Só o formato do hash chega à tela, nunca o valor.
  const legacyPassword = !user.passwordHash.startsWith("$2");

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title={user.name}
        description={user.active ? undefined : "conta inativa"}
      />

      <Section title="Dados da conta">
        <UserForm
          teams={teams}
          values={{
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            teamId: user.teamId,
            phone: user.phone,
            active: user.active,
          }}
        />
      </Section>

      <Section title="Senha">
        {legacyPassword && (
          <p className="mb-3 rounded-md bg-info-subtle px-3 py-2 text-[12px] leading-relaxed text-info">
            Esta conta veio do sistema antigo e ainda usa a senha original. Ela
            funciona normalmente — na primeira entrada o sistema converte o
            formato sozinho, sem pedir nada à pessoa.
          </p>
        )}
        <ResetPasswordForm userId={user.id} />
      </Section>

      <Section title="Atividade">
        <dl className="text-[13px]">
          <div className="flex justify-between border-b border-border py-1.5">
            <dt className="text-muted-foreground">Chamados atendendo</dt>
            <dd className="tabular text-foreground">{user._count.assignedTickets}</dd>
          </div>
          <div className="flex justify-between border-b border-border py-1.5">
            <dt className="text-muted-foreground">Chamados abertos por ela</dt>
            <dd className="tabular text-foreground">{user._count.requestedTickets}</dd>
          </div>
          <div className="flex justify-between border-b border-border py-1.5">
            <dt className="text-muted-foreground">Último acesso</dt>
            <dd className="text-foreground">
              {user.lastLogin ? formatDateTime(user.lastLogin) : "nunca entrou"}
            </dd>
          </div>
          <div className="flex justify-between py-1.5">
            <dt className="text-muted-foreground">Criado em</dt>
            <dd className="text-foreground">{formatDateTime(user.createdAt)}</dd>
          </div>
        </dl>

        {user._count.assignedTickets > 0 && (
          <Link
            href={`/chamados?responsavel=${user.id}`}
            className="mt-3 inline-block text-[12px] text-primary hover:underline"
          >
            Ver os chamados desta pessoa →
          </Link>
        )}
      </Section>
    </div>
  );
}
