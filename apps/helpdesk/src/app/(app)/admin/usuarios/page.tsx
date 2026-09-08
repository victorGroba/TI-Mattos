import Link from "next/link";
import type { Metadata } from "next";
import { Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Avatar, EmptyState, PageHeader } from "@/components/ui/misc";
import { Section } from "@/components/ui/section";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import type { Role } from "@/generated/prisma/enums";
import { formatRelative } from "@/lib/format";
import { roleLabels } from "@/lib/labels";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Usuários" };
export const dynamic = "force-dynamic";

const ROLE_TONES: Record<Role, "primary" | "neutral"> = {
  ADMIN: "primary",
  USER: "neutral",
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; papel?: string; inativos?: string }>;
}) {
  const params = await searchParams;
  const showInactive = params.inativos === "1";
  const role = params.papel && params.papel in roleLabels ? (params.papel as Role) : undefined;
  const term = params.q?.trim();

  const users = await prisma.user.findMany({
    where: {
      ...(showInactive ? {} : { active: true }),
      ...(role ? { role } : {}),
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: "insensitive" } },
              { email: { contains: term, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      lastLogin: true,
      team: { select: { name: true } },
      _count: { select: { assignedTickets: true, requestedTickets: true } },
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuários"
        description={`${users.length} ${users.length === 1 ? "conta" : "contas"}`}
        action={
          <Button asChild size="sm">
            <Link href="/admin/usuarios/novo">
              <Plus />
              Novo usuário
            </Link>
          </Button>
        }
      />

      <form action="/admin/usuarios" method="get" className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
          <Input
            name="q"
            defaultValue={term ?? ""}
            placeholder="Buscar por nome ou e-mail"
            className="pl-8"
            aria-label="Buscar usuários"
          />
        </div>
        <Select
          name="papel"
          defaultValue={role ?? ""}
          aria-label="Papel"
          className="w-auto min-w-[9rem]"
        >
          <option value="">Todos os papéis</option>
          {(Object.keys(roleLabels) as Role[]).map((r) => (
            <option key={r} value={r}>
              {roleLabels[r]}
            </option>
          ))}
        </Select>
        <Select
          name="inativos"
          defaultValue={showInactive ? "1" : ""}
          aria-label="Contas inativas"
          className="w-auto min-w-[9rem]"
        >
          <option value="">Somente ativos</option>
          <option value="1">Incluir inativos</option>
        </Select>
        <Button type="submit" variant="secondary" size="sm">
          Filtrar
        </Button>
      </form>

      <Section title="Contas">
        {users.length === 0 ? (
          <EmptyState title="Nenhum usuário encontrado." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th>Papel</Th>
                <Th>Setor</Th>
                <Th className="text-right">Atendendo</Th>
                <Th className="text-right">Abriu</Th>
                <Th className="text-right">Último acesso</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <Tr key={u.id}>
                  <Td>
                    <Link
                      href={`/admin/usuarios/${u.id}`}
                      className="flex items-center gap-2 hover:text-primary"
                    >
                      <Avatar name={u.name} id={u.id} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {u.name}
                          {!u.active && (
                            <span className="ml-1.5 text-[11px] font-normal text-subtle-foreground">
                              inativo
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-[11px] text-subtle-foreground">
                          {u.email}
                        </span>
                      </span>
                    </Link>
                  </Td>
                  <Td>
                    <Badge tone={ROLE_TONES[u.role]}>{roleLabels[u.role]}</Badge>
                  </Td>
                  <Td className="text-muted-foreground">{u.team?.name ?? "—"}</Td>
                  <Td className="tabular text-right text-muted-foreground">
                    {u._count.assignedTickets}
                  </Td>
                  <Td className="tabular text-right text-muted-foreground">
                    {u._count.requestedTickets}
                  </Td>
                  <Td className="text-right text-[12px] text-subtle-foreground">
                    {u.lastLogin ? formatRelative(u.lastLogin) : "nunca"}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
    </div>
  );
}
