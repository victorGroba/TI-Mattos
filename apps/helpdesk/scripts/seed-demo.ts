import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { addBusinessMinutes, calendarFromPolicy } from "../src/lib/business-hours";
import { computeDeadlines, elapsedMinutes, selectPolicy } from "../src/lib/sla";
import type { Priority, TicketStatus, TicketType } from "../src/generated/prisma/enums";

// APENAS PARA DEMONSTRAÇÃO E DESENVOLVIMENTO LOCAL.
// Nunca rodar em produção — cria chamados fictícios.
//
// Os prazos, tempos de resposta e de solução são calculados com as MESMAS
// funções que o sistema usa em produção (computeDeadlines, elapsedMinutes,
// addBusinessMinutes). Só o relógio é controlado: em vez de "agora", cada
// chamado recebe uma data no passado. Assim o painel mostra números que
// batem com a lógica real, e não valores plausíveis inventados à mão.

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const DAYS_BACK = 75;

// Gerador determinístico: rodar de novo produz o mesmo cenário, o que torna
// possível comparar telas entre execuções.
let seed = 20260904;
function random(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}
function between(min: number, max: number): number {
  return Math.floor(min + random() * (max - min));
}

const ASSUNTOS_SUPORTE = [
  "Impressora da recepção não imprime em rede",
  "Notebook não conecta no Wi-Fi do laboratório",
  "Outlook pedindo senha repetidamente",
  "Sistema de laudos travando ao gerar PDF",
  "Precisa liberar acesso à pasta de resultados",
  "Monitor da bancada 3 sem sinal",
  "Telefone do ramal 204 mudo",
  "Backup do computador da qualidade não rodou",
  "Criar usuário para nova colaboradora",
  "Leitor de código de barras parou de ler",
  "Excel abrindo muito devagar",
  "Sem acesso ao compartilhamento do servidor",
  "Balança não comunica com o sistema",
  "Certificado digital expirando",
  "Nobreak apitando na sala técnica",
];

const ASSUNTOS_INCIDENTE = [
  "Internet caiu no prédio inteiro",
  "Servidor de arquivos fora do ar",
  "Sistema de laudos inacessível para todos",
  "Falta de energia derrubou o rack",
];

const ASSUNTOS_PROJETO = [
  "Incluir campo de lote no cadastro de amostra",
  "Relatório mensal de produtividade por analista",
  "Integrar emissão de laudo com o portal do cliente",
  "Ajustar layout do laudo microbiológico",
  "Exportar resultados em CSV",
  "Alerta automático de amostra vencendo",
  "Permitir anexar foto na coleta",
  "Dashboard de faturamento por convênio",
  "Assinatura digital no laudo",
  "Histórico de alterações do cadastro de cliente",
];

const RESPOSTAS = [
  "Bom dia! Já estou verificando, assim que tiver novidade aviso por aqui.",
  "Consegui reproduzir o problema. Vou precisar de um acesso remoto à máquina.",
  "Ajuste aplicado. Pode testar e confirmar, por favor?",
  "Testei aqui e voltou a funcionar normalmente. Vou deixar em observação.",
  "Precisei abrir chamado com o fornecedor, estou aguardando retorno deles.",
  "Feito. Qualquer coisa é só reabrir o chamado.",
  "Obrigado pelo retorno! Vou encerrar então.",
  "Consegui testar e continua com o mesmo erro.",
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("seed-demo não deve rodar em produção.");
  }

  const existing = await prisma.ticket.count();
  if (existing > 0) {
    console.log(`! já existem ${existing} chamados — nada a fazer.`);
    console.log("  Para recriar: npx tsx scripts/seed-demo.ts --reset");
    if (!process.argv.includes("--reset")) return;

    // A cascata do schema limpa eventos, períodos e comentários junto.
    await prisma.ticket.deleteMany();
    await prisma.project.deleteMany();
    console.log("✓ chamados e projetos anteriores removidos");
  }

  const teams = await prisma.team.findMany({ orderBy: { id: "asc" } });
  const categories = await prisma.category.findMany({ orderBy: { id: "asc" } });
  const users = await prisma.user.findMany({ where: { active: true }, orderBy: { id: "asc" } });
  const policies = await prisma.slaPolicy.findMany({ where: { active: true }, orderBy: { id: "asc" } });

  if (teams.length === 0 || users.length === 0) {
    throw new Error("Rode o seed e a migração de dados legados primeiro.");
  }

  const ti = teams.find((t) => t.name === "TI") ?? teams[0];

  // Quem atende é administrador. O script NÃO promove ninguém: mexer em papel
  // é decisão de quem administra, e uma promoção silenciosa feita por um seed
  // de demonstração já causou exatamente a confusão de um usuário comum
  // enxergando a fila inteira da empresa.
  const agents = users.filter((u) => u.role === "ADMIN");
  if (agents.length === 0) {
    throw new Error(
      "Nenhum administrador ativo. Defina ao menos um antes de gerar os dados de demonstração.",
    );
  }
  const requesters = users.filter((u) => u.role !== "ADMIN");
  if (requesters.length === 0) {
    throw new Error("Nenhum usuário comum para abrir chamados de demonstração.");
  }

  console.log(`✓ ${agents.length} administrador(es) atendendo, ${requesters.length} solicitantes`);

  // ---- Projetos ----
  const projectSpecs = [
    { name: "Portal do Cliente", key: "PORTAL", status: "ACTIVE" as const },
    { name: "Sistema de Laudos", key: "LAUDOS", status: "ACTIVE" as const },
    { name: "Automação da Qualidade", key: "QUALI", status: "PLANNING" as const },
  ];

  const projects = [];
  for (const spec of projectSpecs) {
    projects.push(
      await prisma.project.create({
        data: {
          ...spec,
          description: null,
          teamId: ti.id,
          ownerId: agents[0].id,
          startsAt: new Date(Date.now() - 90 * 86_400_000),
          dueAt: new Date(Date.now() + between(20, 120) * 86_400_000),
        },
      }),
    );
  }
  console.log(`✓ ${projects.length} projetos`);

  // ---- Chamados ----
  const TOTAL = 90;
  let created = 0;

  for (let i = 0; i < TOTAL; i++) {
    const isProject = random() < 0.3;
    const isIncident = !isProject && random() < 0.12;

    const type: TicketType = isProject
      ? pick(["CHANGE_REQUEST", "CHANGE_REQUEST", "IMPROVEMENT", "TASK"] as const)
      : isIncident
        ? "INCIDENT"
        : "SUPPORT";

    const priority: Priority = isIncident
      ? pick(["URGENT", "HIGH"] as const)
      : pick(["LOW", "MEDIUM", "MEDIUM", "MEDIUM", "HIGH"] as const);

    const title = isProject
      ? pick(ASSUNTOS_PROJETO)
      : isIncident
        ? pick(ASSUNTOS_INCIDENTE)
        : pick(ASSUNTOS_SUPORTE);

    const requester = pick(requesters);
    const team = isProject || isIncident ? ti : pick([ti, ti, ...teams.slice(0, 6)]);
    const category = isProject ? null : pick(categories);
    const project = isProject ? pick(projects) : null;

    // Distribui no tempo, com mais chamados nas semanas recentes.
    const ageDays = Math.floor(DAYS_BACK * random() * random());
    const createdAt = new Date(Date.now() - ageDays * 86_400_000 - between(0, 8) * 3_600_000);

    const policy = selectPolicy(policies, { teamId: team.id, type, priority });
    const deadlines = computeDeadlines(policy, createdAt);
    const calendar = policy?.businessHoursOnly ? calendarFromPolicy(policy) : null;

    /** Avança na régua da política: horário útil ou tempo corrido. */
    const advance = (from: Date, minutes: number) =>
      calendar
        ? addBusinessMinutes(from, minutes, calendar)
        : new Date(from.getTime() + minutes * 60_000);

    // Chamados antigos têm muito mais chance de já estarem fechados.
    const closedChance = ageDays > 30 ? 0.92 : ageDays > 10 ? 0.7 : 0.35;
    const isClosed = random() < closedChance;

    // ~12% ficam sem nenhuma resposta — é o caso que o painel precisa expor.
    const gotResponse = isClosed || random() > 0.12;

    const assignee = gotResponse || random() > 0.4 ? pick(agents) : null;

    let firstResponseAt: Date | null = null;
    let firstResponseMinutes: number | null = null;
    if (gotResponse) {
      const responseIn = Math.round(
        (policy?.responseMinutes ?? 240) * (0.15 + random() * 1.6),
      );
      firstResponseAt = advance(createdAt, responseIn);
      if (firstResponseAt > new Date()) firstResponseAt = new Date();
      firstResponseMinutes = elapsedMinutes(createdAt, firstResponseAt, policy);
    }

    const status: TicketStatus = isClosed
      ? pick(["CLOSED", "CLOSED", "RESOLVED"] as const)
      : gotResponse
        ? pick([
            "IN_PROGRESS",
            "IN_PROGRESS",
            "TRIAGED",
            "WAITING_REQUESTER",
            "WAITING_THIRD_PARTY",
            "IN_REVIEW",
          ] as const)
        : "OPEN";

    let resolvedAt: Date | null = null;
    let resolutionMinutes: number | null = null;
    if (isClosed && firstResponseAt) {
      const resolveIn = Math.round(
        (policy?.resolutionMinutes ?? 960) * (0.2 + random() * 1.8),
      );
      resolvedAt = advance(createdAt, resolveIn);
      if (resolvedAt > new Date()) resolvedAt = new Date();
      resolutionMinutes = elapsedMinutes(createdAt, resolvedAt, policy);
    }

    const now = new Date();
    const responseBreached = Boolean(
      deadlines.responseDueAt &&
        (firstResponseAt
          ? firstResponseAt > deadlines.responseDueAt
          : now > deadlines.responseDueAt),
    );
    const resolutionBreached = Boolean(
      deadlines.resolutionDueAt &&
        (resolvedAt
          ? resolvedAt > deadlines.resolutionDueAt
          : now > deadlines.resolutionDueAt),
    );

    const ticket = await prisma.ticket.create({
      data: {
        title,
        description: `${title}.\n\nRegistrado pelo setor ${team.name}. Detalhes informados no atendimento.`,
        type,
        status,
        priority,
        teamId: team.id,
        categoryId: category?.id ?? null,
        projectId: project?.id ?? null,
        requesterId: requester.id,
        assigneeId: assignee?.id ?? null,
        source: "WEB",
        createdAt,
        updatedAt: resolvedAt ?? firstResponseAt ?? createdAt,
        ...deadlines,
        firstResponseAt,
        firstResponseMinutes,
        startedAt: firstResponseAt,
        resolvedAt,
        closedAt: status === "CLOSED" ? resolvedAt : null,
        resolutionMinutes,
        slaResponseBreached: responseBreached,
        slaResolutionBreached: resolutionBreached && !isClosed ? true : resolutionBreached,
        reopenCount: random() < 0.08 ? 1 : 0,
      },
    });

    // ---- Histórico: períodos de status e eventos ----
    const marks: Array<{ status: TicketStatus; at: Date }> = [{ status: "OPEN", at: createdAt }];
    if (firstResponseAt) marks.push({ status: "IN_PROGRESS", at: firstResponseAt });
    if (resolvedAt) marks.push({ status: status === "CLOSED" ? "CLOSED" : "RESOLVED", at: resolvedAt });
    else if (firstResponseAt && status !== "IN_PROGRESS") {
      marks.push({
        status,
        at: advance(firstResponseAt, between(30, 600)),
      });
    }

    let workingMinutes = 0;
    for (let m = 0; m < marks.length; m++) {
      const start = marks[m].at;
      const end = marks[m + 1]?.at ?? null;
      const business = end ? elapsedMinutes(start, end, policy) : null;

      await prisma.ticketStatusPeriod.create({
        data: {
          ticketId: ticket.id,
          status: marks[m].status,
          assigneeId: assignee?.id ?? null,
          startedAt: start,
          endedAt: end,
          minutes: end ? Math.round((end.getTime() - start.getTime()) / 60_000) : null,
          businessMinutes: business,
        },
      });

      const s = marks[m].status;
      if (business && s !== "WAITING_REQUESTER" && s !== "WAITING_THIRD_PARTY" &&
          s !== "RESOLVED" && s !== "CLOSED" && s !== "CANCELLED") {
        workingMinutes += business;
      }
    }

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { workingMinutes },
    });

    await prisma.ticketEvent.create({
      data: { ticketId: ticket.id, actorId: requester.id, type: "CREATED", createdAt },
    });

    if (firstResponseAt && assignee) {
      await prisma.comment.create({
        data: {
          ticketId: ticket.id,
          authorId: assignee.id,
          body: pick(RESPOSTAS),
          createdAt: firstResponseAt,
        },
      });
      await prisma.ticketEvent.createMany({
        data: [
          {
            ticketId: ticket.id,
            actorId: assignee.id,
            type: "ASSIGNED",
            field: "assigneeId",
            toValue: String(assignee.id),
            createdAt: firstResponseAt,
          },
          {
            ticketId: ticket.id,
            actorId: assignee.id,
            type: "FIRST_RESPONSE",
            createdAt: firstResponseAt,
            metadata: { minutes: firstResponseMinutes, breached: responseBreached },
          },
        ],
      });

      // Conversa de ida e volta em parte dos chamados.
      if (random() < 0.5) {
        const replyAt = advance(firstResponseAt, between(20, 480));
        if (replyAt < now) {
          await prisma.comment.create({
            data: {
              ticketId: ticket.id,
              authorId: requester.id,
              body: pick(RESPOSTAS),
              createdAt: replyAt,
            },
          });
        }
      }

      // Nota interna ocasional, para a tela mostrar o caso.
      if (random() < 0.2) {
        await prisma.comment.create({
          data: {
            ticketId: ticket.id,
            authorId: assignee.id,
            body: "Verificar com o fornecedor antes de escalar. Contrato vence em novembro.",
            internal: true,
            createdAt: advance(firstResponseAt, between(10, 120)),
          },
        });
      }
    }

    if (resolvedAt) {
      await prisma.ticketEvent.create({
        data: {
          ticketId: ticket.id,
          actorId: assignee?.id ?? null,
          type: "STATUS_CHANGED",
          field: "status",
          fromValue: "IN_PROGRESS",
          toValue: status,
          createdAt: resolvedAt,
        },
      });

      // Apontamento de horas em parte das demandas de projeto.
      if (project && random() < 0.6 && assignee) {
        await prisma.timeEntry.create({
          data: {
            ticketId: ticket.id,
            userId: assignee.id,
            minutes: between(30, 480),
            note: "Desenvolvimento e testes",
            spentOn: resolvedAt,
          },
        });
      }
    }

    created++;
  }

  console.log(`✓ ${created} chamados criados`);

  const resumo = await prisma.ticket.groupBy({
    by: ["status"],
    _count: { _all: true },
    orderBy: { status: "asc" },
  });
  for (const r of resumo) {
    console.log(`    ${r.status.padEnd(20)} ${r._count._all}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
