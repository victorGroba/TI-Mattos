import Link from "next/link";
import type { Metadata } from "next";
import { Plus, Ticket } from "lucide-react";
import { Pagination } from "@/components/tickets/pagination";
import { TicketRow } from "@/components/tickets/ticket-row";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Section } from "@/components/ui/section";
import { activeStatuses } from "@/lib/labels";
import { requireUser } from "@/lib/session";
import { listTickets } from "@/lib/ticket-queries";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Meus chamados" };
export const dynamic = "force-dynamic";

export default async function MyTicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser("/meus-chamados");
  const params = await searchParams;
  const showClosed = params.encerrados === "1";

  // Sempre restrito a quem abriu, mesmo para atendentes: esta tela é
  // "o que EU pedi", enquanto /chamados é "o que o time atende".
  const [{ items, total, page, pageCount }, openCount] = await Promise.all([
    listTickets(user, {
      requesterOnly: true,
      onlyOpen: !showClosed,
      page: Number(params.pagina) || 1,
    }),
    prisma.ticket.count({
      where: { requesterId: user.id, status: { in: activeStatuses } },
    }),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Meus chamados"
        description={
          openCount > 0
            ? `${openCount} ${openCount === 1 ? "chamado em aberto" : "chamados em aberto"}`
            : "Você não tem chamados em aberto"
        }
        action={
          <Button asChild>
            <Link href="/chamados/novo">
              <Plus />
              Abrir chamado
            </Link>
          </Button>
        }
      />

      <div className="flex gap-2">
        <Button asChild variant={showClosed ? "ghost" : "secondary"} size="sm">
          <Link href="/meus-chamados">Em aberto</Link>
        </Button>
        <Button asChild variant={showClosed ? "secondary" : "ghost"} size="sm">
          <Link href="/meus-chamados?encerrados=1">Todos</Link>
        </Button>
      </div>

      <Section title={showClosed ? "Todos os meus chamados" : "Em aberto"}>
        {items.length === 0 ? (
          <EmptyState
            icon={Ticket}
            title={showClosed ? "Você ainda não abriu chamados." : "Nada em aberto."}
            description="Precisa de alguma coisa da TI ou de outro setor? Abra um chamado."
            action={
              <Button asChild size="sm">
                <Link href="/chamados/novo">
                  <Plus />
                  Abrir chamado
                </Link>
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
                basePath="/meus-chamados"
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
