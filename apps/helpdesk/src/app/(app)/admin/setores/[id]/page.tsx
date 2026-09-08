import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { TeamForm } from "@/components/admin/team-form";
import { Avatar, PageHeader } from "@/components/ui/misc";
import { Section } from "@/components/ui/section";
import { roleLabels } from "@/lib/labels";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const team = await prisma.team.findUnique({
    where: { id: Number(id) || 0 },
    select: { name: true },
  });
  return { title: team?.name ?? "Setor" };
}

export default async function EditTeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const teamId = Number(id);
  if (!Number.isInteger(teamId) || teamId <= 0) notFound();

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      email: true,
      description: true,
      active: true,
      members: {
        select: { id: true, name: true, role: true, active: true },
        orderBy: { name: "asc" },
      },
      categories: { select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
  });

  if (!team) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title={team.name} description={team.active ? undefined : "inativo"} />

      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[22rem_1fr]">
        <Section title="Dados do setor">
          <TeamForm
            values={{
              id: team.id,
              name: team.name,
              email: team.email,
              description: team.description,
              active: team.active,
            }}
          />
        </Section>

        <div className="space-y-6">
          <Section
            title={`Pessoas (${team.members.length})`}
            action={
              <Link
                href={`/chamados?setor=${team.id}`}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                ver a fila →
              </Link>
            }
          >
            {team.members.length === 0 ? (
              <p className="py-3 text-[13px] text-muted-foreground">
                Ninguém vinculado a este setor.
              </p>
            ) : (
              <ul>
                {team.members.map((m) => (
                  <li key={m.id} className="border-t border-border first:border-t-0">
                    <Link
                      href={`/admin/usuarios/${m.id}`}
                      className="flex items-center gap-2 py-1.5 transition-colors hover:text-primary"
                    >
                      <Avatar name={m.name} id={m.id} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-[13px]">
                        {m.name}
                      </span>
                      <span className="shrink-0 text-[11px] text-subtle-foreground">
                        {roleLabels[m.role]}
                        {!m.active && " · inativo"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={`Categorias que caem aqui (${team.categories.length})`}>
            {team.categories.length === 0 ? (
              <p className="py-3 text-[13px] text-muted-foreground">
                Nenhuma categoria roteia para este setor — os chamados precisarão
                de triagem manual.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {team.categories.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/admin/categorias/${c.id}`}
                      className="inline-block rounded border border-border px-2 py-0.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
