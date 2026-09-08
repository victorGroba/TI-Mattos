import "dotenv/config";
import { DatabaseSync } from "node:sqlite";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { Priority, TicketStatus } from "../src/generated/prisma/enums";
import { computeDeadlines, elapsedMinutes, selectPolicy } from "../src/lib/sla";

// Importa os CHAMADOS e as RESPOSTAS do HelpDesk em Flask/SQLite.
//
// Roda depois de scripts/migrate-legacy.ts, porque depende de usuários,
// setores e categorias já existirem com os IDs originais.
//
// Uso:
//   npx tsx scripts/migrate-legacy-tickets.ts /legado/helpdesk.db [--dry-run]
//
// Idempotente: um chamado cujo id já exista é pulado.
//
// SOBRE AS MÉTRICAS
//
// O sistema antigo guardava só a data de criação e um status que sobrescrevia
// o anterior — não havia data de resolução nem histórico de transições. Este
// script NÃO inventa esses números:
//
//   - Primeira resposta: real, quando existe uma resposta de outra pessoa que
//     não o solicitante. É a diferença entre dois carimbos de tempo reais.
//   - Resolução: usa a data da ÚLTIMA resposta como aproximação, e só quando
//     ela existe. Um chamado concluído sem nenhuma resposta entra como
//     encerrado, mas sem tempo de resolução — em vez de contribuir com um
//     número falso para a média de entrega.
//
// Ou seja: o histórico fica visível e navegável, e os indicadores continuam
// contando apenas o que aconteceu de fato.

interface LegacyTicket {
  id: number;
  titulo: string;
  descricao: string;
  prioridade: string;
  status: string;
  data_criacao: string | null;
  categoria_id: number | null;
  setor_id: number;
  criador_id: number;
}

interface LegacyResposta {
  id: number;
  conteudo: string;
  data_resposta: string | null;
  ticket_id: number;
  respondente_id: number;
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/** 'Baixa' | 'Média' | 'Alta' — o sistema antigo não tinha urgente. */
function mapPriority(value: string): Priority {
  switch (value?.trim().toLowerCase()) {
    case "alta":
      return "HIGH";
    case "baixa":
      return "LOW";
    default:
      return "MEDIUM";
  }
}

/** 'Aberto' | 'Em andamento' | 'Concluído'. */
function mapStatus(value: string): TicketStatus {
  const v = value?.trim().toLowerCase();
  if (v === "concluído" || v === "concluido") return "CLOSED";
  if (v === "em andamento") return "IN_PROGRESS";
  return "OPEN";
}

/**
 * O SQLite guarda DATETIME como texto. Sem fuso declarado, o Flask gravava em
 * UTC (datetime.utcnow), então é assim que interpretamos.
 */
function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const iso = value.includes("T") ? value : value.replace(" ", "T");
  const d = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function main() {
  const dbPath = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");

  if (!dbPath) {
    console.error("Informe o caminho do helpdesk.db legado.");
    console.error("  npx tsx scripts/migrate-legacy-tickets.ts /legado/helpdesk.db [--dry-run]");
    process.exit(1);
  }

  const legacy = new DatabaseSync(dbPath, { readOnly: true });

  const tickets = legacy
    .prepare("SELECT * FROM ticket ORDER BY id")
    .all() as unknown as LegacyTicket[];
  const respostas = legacy
    .prepare("SELECT * FROM resposta ORDER BY ticket_id, data_resposta, id")
    .all() as unknown as LegacyResposta[];

  console.log(`Origem: ${dbPath}`);
  console.log(`  chamados:  ${tickets.length}`);
  console.log(`  respostas: ${respostas.length}`);
  console.log("");

  // Agrupa as respostas por chamado, já em ordem cronológica.
  const porTicket = new Map<number, LegacyResposta[]>();
  for (const r of respostas) {
    const lista = porTicket.get(r.ticket_id) ?? [];
    lista.push(r);
    porTicket.set(r.ticket_id, lista);
  }

  // Verifica as referências antes de gravar qualquer coisa: um chamado cujo
  // setor ou autor não existe no destino não pode ser inserido, e é melhor
  // saber disso antes de gravar metade.
  const [teamIds, userIds, categoryIds, policies] = await Promise.all([
    prisma.team.findMany({ select: { id: true } }).then((r) => new Set(r.map((x) => x.id))),
    prisma.user.findMany({ select: { id: true } }).then((r) => new Set(r.map((x) => x.id))),
    prisma.category.findMany({ select: { id: true } }).then((r) => new Set(r.map((x) => x.id))),
    prisma.slaPolicy.findMany({ where: { active: true }, orderBy: { id: "asc" } }),
  ]);

  const problemas: string[] = [];
  for (const t of tickets) {
    if (!teamIds.has(t.setor_id)) problemas.push(`#${t.id}: setor ${t.setor_id} não existe`);
    if (!userIds.has(t.criador_id)) problemas.push(`#${t.id}: autor ${t.criador_id} não existe`);
  }
  if (problemas.length > 0) {
    console.error("ERRO: referências ausentes. Rode migrate-legacy.ts primeiro.");
    for (const p of problemas.slice(0, 15)) console.error(`  - ${p}`);
    if (problemas.length > 15) console.error(`  ... e mais ${problemas.length - 15}`);
    process.exit(1);
  }

  if (dryRun) {
    const porStatus = new Map<string, number>();
    for (const t of tickets) {
      const s = mapStatus(t.status);
      porStatus.set(s, (porStatus.get(s) ?? 0) + 1);
    }
    console.log("Distribuição por status no destino:");
    for (const [s, n] of porStatus) console.log(`  ${s.padEnd(14)} ${n}`);
    console.log("\n--dry-run: nada foi gravado.");
    legacy.close();
    return;
  }

  let criados = 0;
  let pulados = 0;
  let comentarios = 0;

  for (const t of tickets) {
    const existente = await prisma.ticket.findUnique({
      where: { id: t.id },
      select: { id: true },
    });
    if (existente) {
      pulados += 1;
      continue;
    }

    const createdAt = parseDate(t.data_criacao) ?? new Date();
    const status = mapStatus(t.status);
    const priority = mapPriority(t.prioridade);
    const minhasRespostas = porTicket.get(t.id) ?? [];

    // Primeira resposta de outra pessoa que não quem abriu — a aproximação
    // mais honesta possível para "o time respondeu".
    const primeiraDeTerceiro = minhasRespostas.find(
      (r) => r.respondente_id !== t.criador_id,
    );
    const firstResponseAt = parseDate(primeiraDeTerceiro?.data_resposta ?? null);

    // Resolução: data da última resposta, e só para o que está concluído.
    const ultima = minhasRespostas[minhasRespostas.length - 1];
    const resolvedAt =
      status === "CLOSED" ? parseDate(ultima?.data_resposta ?? null) : null;

    const policy = selectPolicy(policies, {
      teamId: t.setor_id,
      type: "SUPPORT",
      priority,
    });
    const deadlines = computeDeadlines(policy, createdAt);

    await prisma.$transaction(async (tx) => {
      await tx.ticket.create({
        data: {
          id: t.id,
          title: t.titulo,
          description: t.descricao,
          type: "SUPPORT",
          status,
          priority,
          teamId: t.setor_id,
          categoryId:
            t.categoria_id && categoryIds.has(t.categoria_id) ? t.categoria_id : null,
          requesterId: t.criador_id,
          assigneeId: null,
          source: "IMPORT",
          createdAt,
          updatedAt: resolvedAt ?? firstResponseAt ?? createdAt,
          ...deadlines,
          firstResponseAt,
          firstResponseMinutes: firstResponseAt
            ? elapsedMinutes(createdAt, firstResponseAt, policy)
            : null,
          startedAt: firstResponseAt,
          resolvedAt,
          closedAt: resolvedAt,
          // Nulo quando não há data real de resolução: um chamado concluído
          // sem resposta não pode inventar tempo de entrega.
          resolutionMinutes: resolvedAt
            ? elapsedMinutes(createdAt, resolvedAt, policy)
            : null,
          slaResponseBreached: Boolean(
            deadlines.responseDueAt &&
              firstResponseAt &&
              firstResponseAt > deadlines.responseDueAt,
          ),
          slaResolutionBreached: Boolean(
            deadlines.resolutionDueAt &&
              resolvedAt &&
              resolvedAt > deadlines.resolutionDueAt,
          ),
        },
      });

      await tx.ticketEvent.create({
        data: {
          ticketId: t.id,
          actorId: t.criador_id,
          type: "CREATED",
          createdAt,
          metadata: { origem: "importação do sistema antigo" },
        },
      });

      // Períodos de status: só os trechos delimitados por datas reais.
      const marcos: Array<{ status: TicketStatus; at: Date }> = [
        { status: "OPEN", at: createdAt },
      ];
      if (firstResponseAt) marcos.push({ status: "IN_PROGRESS", at: firstResponseAt });
      if (resolvedAt) marcos.push({ status: "CLOSED", at: resolvedAt });

      for (let i = 0; i < marcos.length; i++) {
        const inicio = marcos[i].at;
        const fim = marcos[i + 1]?.at ?? null;
        await tx.ticketStatusPeriod.create({
          data: {
            ticketId: t.id,
            status: marcos[i].status,
            startedAt: inicio,
            endedAt: fim,
            minutes: fim ? Math.round((fim.getTime() - inicio.getTime()) / 60_000) : null,
            businessMinutes: fim ? elapsedMinutes(inicio, fim, policy) : null,
          },
        });
      }

      for (const r of minhasRespostas) {
        const at = parseDate(r.data_resposta) ?? createdAt;
        await tx.comment.create({
          data: {
            ticketId: t.id,
            authorId: userIds.has(r.respondente_id) ? r.respondente_id : null,
            body: r.conteudo,
            internal: false,
            source: "IMPORT",
            createdAt: at,
          },
        });
        await tx.ticketEvent.create({
          data: {
            ticketId: t.id,
            actorId: userIds.has(r.respondente_id) ? r.respondente_id : null,
            type: "COMMENT_ADDED",
            createdAt: at,
          },
        });
        comentarios += 1;
      }
    });

    criados += 1;
  }

  console.log(`✓ chamados migrados: ${criados}${pulados ? ` (${pulados} já existiam)` : ""}`);
  console.log(`✓ respostas migradas: ${comentarios}`);

  // Os ids foram inseridos manualmente; sem isto, o próximo chamado aberto
  // pela tela colidiria com uma chave já usada.
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"tickets"', 'id'),
            GREATEST((SELECT COALESCE(MAX(id), 0) FROM "tickets"), 1))`,
  );
  console.log("✓ sequence de chamados realinhada");

  legacy.close();
}

main()
  .catch((error) => {
    console.error("Falha na migração:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
