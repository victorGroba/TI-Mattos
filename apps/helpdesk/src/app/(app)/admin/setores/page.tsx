import Link from "next/link";
import type { Metadata } from "next";
import { TeamForm } from "@/components/admin/team-form";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Section } from "@/components/ui/section";
import { Table, Td, TdNum, Th, Tr } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { activeStatuses } from "@/lib/labels";

export const metadata: Metadata = { title: "Setores" };
export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const [teams, openByTeam] = await Promise.all([
    prisma.team.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        _count: { select: { members: true, tickets: true, categories: true } },
      },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    prisma.ticket.groupBy({
      by: ["teamId"],
      where: { status: { in: activeStatuses } },
      _count: { _all: true },
    }),
  ]);

  const openBy = new Map(openByTeam.map((r) => [r.teamId, r._count._all]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Setores"
        description={`${teams.length} cadastrados`}
      />

      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[1fr_20rem]">
        <Section title="Cadastrados">
          {teams.length === 0 ? (
            <EmptyState title="Nenhum setor cadastrado." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Setor</Th>
                  <Th>E-mail</Th>
                  <Th className="text-right">Pessoas</Th>
                  <Th className="text-right">Fila</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {teams.map((team) => (
                  <Tr key={team.id}>
                    <Td>
                      <Link
                        href={`/admin/setores/${team.id}`}
                        className="font-medium hover:text-primary"
                      >
                        {team.name}
                      </Link>
                      {!team.active && (
                        <span className="ml-1.5 text-[11px] text-subtle-foreground">
                          inativo
                        </span>
                      )}
                    </Td>
                    <Td className="max-w-[14rem] truncate text-[12px] text-muted-foreground">
                      {team.email ?? "—"}
                    </Td>
                    <TdNum className="text-muted-foreground">
                      {team._count.members}
                    </TdNum>
                    <TdNum
                      className={
                        (openBy.get(team.id) ?? 0) > 0
                          ? "text-foreground"
                          : "text-subtle-foreground"
                      }
                    >
                      {openBy.get(team.id) ?? 0}
                    </TdNum>
                    <TdNum className="text-muted-foreground">
                      {team._count.tickets}
                    </TdNum>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Section>

        <Section title="Novo setor">
          <TeamForm />
        </Section>
      </div>
    </div>
  );
}
