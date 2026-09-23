import Link from "next/link";
import type { Metadata } from "next";
import { FileSignature, Plus, Ticket } from "lucide-react";
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
  const [{ items, total, page, pageCount }, openCount, termsToSign] = await Promise.all([
    listTickets(user, {
      requesterOnly: true,
      onlyOpen: !showClosed,
      page: Number(params.pagina) || 1,
    }),
    prisma.ticket.count({
      where: { requesterId: user.id, status: { in: activeStatuses } },
    }),
    prisma.responsibilityTerm.count({ where: { userId: user.id, status: "PENDING" } }),
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

      {/* Esta é a tela de entrada do colaborador: um termo esperando
          assinatura aparece aqui, sem depender de ele abrir o sino. */}
      {termsToSign > 0 && (
        <Link
          href="/meus-equipamentos"
          className="flex items-center gap-3 rounded-lg border border-warning/40 bg-warning-subtle px-4 py-3 transition-colors hover:border-warning"
        >
          <FileSignature className="size-5 shrink-0 text-warning" />
          <span className="min-w-0 flex-1 text-[13px] text-foreground">
            <strong className="font-semibold">
              {termsToSign === 1
                ? "Um termo de responsabilidade espera sua assinatura."
                : `${termsToSign} termos de responsabilidade esperam sua assinatura.`}
            </strong>{" "}
            <span className="text-muted-foreground">É sobre o equipamento da empresa no seu nome.</span>
          </span>
          <span className="shrink-0 text-[13px] font-medium text-primary">Assinar →</span>
        </Link>
      )}

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
