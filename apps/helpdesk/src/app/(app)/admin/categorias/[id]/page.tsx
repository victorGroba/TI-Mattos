import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CategoryForm } from "@/components/admin/category-form";
import { PageHeader } from "@/components/ui/misc";
import { Section } from "@/components/ui/section";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const category = await prisma.category.findUnique({
    where: { id: Number(id) || 0 },
    select: { name: true },
  });
  return { title: category?.name ?? "Categoria" };
}

export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const categoryId = Number(id);
  if (!Number.isInteger(categoryId) || categoryId <= 0) notFound();

  const [category, teams] = await Promise.all([
    prisma.category.findUnique({
      where: { id: categoryId },
      select: {
        id: true,
        name: true,
        teamId: true,
        defaultType: true,
        description: true,
        active: true,
        _count: { select: { tickets: true } },
      },
    }),
    prisma.team.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!category) notFound();

  return (
    <div className="max-w-xl space-y-6">
      <PageHeader
        title={category.name}
        description={`${category._count.tickets} ${category._count.tickets === 1 ? "chamado" : "chamados"}`}
      />

      <Section title="Dados da categoria">
        <CategoryForm
          teams={teams}
          values={{
            id: category.id,
            name: category.name,
            teamId: category.teamId,
            defaultType: category.defaultType,
            description: category.description,
            active: category.active,
          }}
        />
      </Section>

      {category._count.tickets > 0 && (
        <Link
          href={`/chamados?categoria=${category.id}`}
          className="inline-block text-[12px] text-primary hover:underline"
        >
          Ver os chamados desta categoria →
        </Link>
      )}
    </div>
  );
}
