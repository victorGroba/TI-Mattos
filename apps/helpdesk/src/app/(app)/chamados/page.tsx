import Link from "next/link";
import type { Metadata } from "next";
import { Inbox } from "lucide-react";
import { Pagination } from "@/components/tickets/pagination";
import { TicketFilters } from "@/components/tickets/ticket-filters";
import { TicketRow } from "@/components/tickets/ticket-row";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Section } from "@/components/ui/section";
import type { Priority, TicketStatus, TicketType } from "@/generated/prisma/enums";
import { priorityLabels, statusLabels, typeLabels } from "@/lib/labels";
import { requireAdmin } from "@/lib/session";
import { getFormOptions, listTickets } from "@/lib/ticket-queries";
import { parsePeriod, parseSort } from "@/lib/ticket-where";

export const metadata: Metadata = { title: "Chamados" };
export const dynamic = "force-dynamic";

/** Converte o texto da URL em enum, ignorando valor que não existe. */
function asEnum<T extends string>(value: string | undefined, valid: Record<T, string>) {
  return value && value in valid ? (value as T) : undefined;
}

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireAdmin();
  const params = await searchParams;

  const status = asEnum<TicketStatus>(params.status, statusLabels);
  const setorId = Number(params.setor) || undefined;
  const responsavel = params.responsavel;

  const { items, total, page, pageCount } = await listTickets(user, {
    status,
    // "abertos" é um atalho da UI, não um status do banco.
    onlyOpen: params.status === "abertos",
    teamId: setorId,
    type: asEnum<TicketType>(params.tipo, typeLabels),
    priority: asEnum<Priority>(params.prioridade, priorityLabels),
    categoryId: Number(params.categoria) || undefined,
    unassigned: responsavel === "ninguem",
    assigneeId: responsavel && responsavel !== "ninguem" ? Number(responsavel) : undefined,
    overdue: params.atraso === "1",
    search: params.q,
    sort: parseSort(params.ordem),
    period: parsePeriod(params.periodo),
    page: Number(params.pagina) || 1,
  });

  const { teams, agents } = await getFormOptions();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chamados"
        description={`${total} na fila`}
      />

      <TicketFilters options={{ teams, agents }} active={params} />

      <Section title="Fila">
        {items.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Nenhum chamado encontrado."
            description="Ajuste os filtros ou abra um chamado novo."
            action={
              <Button asChild variant="secondary" size="sm">
                <Link href="/chamados">Limpar filtros</Link>
              </Button>
            }
          />
        ) : (
          <>
            <ul>
              {items.map((ticket) => (
                <TicketRow key={ticket.id} ticket={ticket} />
              ))}
            </ul>
            <div className="border-t border-border">
              <Pagination
                basePath="/chamados"
                page={page}
                pageCount={pageCount}
                total={total}
                params={params}
              />
            </div>
          </>
        )}
      </Section>
    </div>
  );
}
