import Link from "next/link";
import type { Metadata } from "next";
import { CategoryForm } from "@/components/admin/category-form";
import { TypeBadge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Section } from "@/components/ui/section";
import { Table, Td, TdNum, Th, Tr } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Categorias" };
export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const [categories, teams] = await Promise.all([
    prisma.category.findMany({
      select: {
        id: true,
        name: true,
        defaultType: true,
        active: true,
        team: { select: { id: true, name: true } },
        _count: { select: { tickets: true } },
      },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    prisma.team.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const semSetor = categories.filter((c) => c.active && !c.team).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categorias"
        description={`${categories.length} cadastradas`}
      />

      {semSetor > 0 && (
        <p className="rounded-md bg-warning-subtle px-3 py-2 text-[12px] leading-relaxed text-warning">
          {semSetor} {semSetor === 1 ? "categoria ativa não aponta" : "categorias ativas não apontam"}{" "}
          para nenhum setor. Chamados abertos com {semSetor === 1 ? "ela" : "elas"} caem
          sem dono e dependem de triagem manual.
        </p>
      )}

      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[1fr_20rem]">
        <Section title="Cadastradas">
          {categories.length === 0 ? (
            <EmptyState title="Nenhuma categoria cadastrada." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Categoria</Th>
                  <Th>Setor que atende</Th>
                  <Th>Tipo padrão</Th>
                  <Th className="text-right">Chamados</Th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <Tr key={c.id}>
                    <Td>
                      <Link
                        href={`/admin/categorias/${c.id}`}
                        className="font-medium hover:text-primary"
                      >
                        {c.name}
                      </Link>
                      {!c.active && (
                        <span className="ml-1.5 text-[11px] text-subtle-foreground">
                          inativa
                        </span>
                      )}
                    </Td>
                    <Td>
                      {c.team ? (
                        <Link
                          href={`/admin/setores/${c.team.id}`}
                          className="text-muted-foreground hover:text-primary"
                        >
                          {c.team.name}
                        </Link>
                      ) : (
                        <span className="text-warning">sem setor</span>
                      )}
                    </Td>
                    <Td>
                      <TypeBadge type={c.defaultType} />
                    </Td>
                    <TdNum className="text-muted-foreground">{c._count.tickets}</TdNum>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Section>

        <Section title="Nova categoria">
          <CategoryForm teams={teams} />
        </Section>
      </div>
    </div>
  );
}
