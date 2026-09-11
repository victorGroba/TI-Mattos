import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { zonedTimeToUtc } from "../src/lib/business-hours";

// Arquiva chamados abertos antes de uma data.
//
// Arquivar NÃO apaga: marca `archivedAt` e o chamado some da fila, dos
// contadores, do painel e das métricas de projeto. A URL direta continua
// funcionando, e o filtro "Arquivados" na fila traz tudo de volta à vista.
//
// Serve para descartar o histórico migrado do sistema antigo sem perder a
// possibilidade de consultá-lo — e sem que ele distorça as médias de tempo de
// entrega da operação nova.
//
// Uso:
//   npx tsx scripts/archive-old-tickets.ts 2026-09-01 --dry-run
//   npx tsx scripts/archive-old-tickets.ts 2026-09-01
//   npx tsx scripts/archive-old-tickets.ts 2026-09-01 --desfazer

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const FUSO = "America/Sao_Paulo";

async function main() {
  const dataTexto = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");
  const desfazer = process.argv.includes("--desfazer");

  if (!dataTexto || !/^\d{4}-\d{2}-\d{2}$/.test(dataTexto)) {
    console.error("Informe a data de corte no formato AAAA-MM-DD.");
    console.error("  npx tsx scripts/archive-old-tickets.ts 2026-09-01 --dry-run");
    process.exit(1);
  }

  const [ano, mes, dia] = dataTexto.split("-").map(Number);

  // Meia-noite de São Paulo, não de UTC: o container roda em UTC, e usar o
  // relógio dele arquivaria indevidamente as três primeiras horas do dia.
  const corte = zonedTimeToUtc(ano, mes, dia, 0, 0, FUSO);

  console.log(`Corte: chamados abertos ANTES de ${dataTexto} (00:00 em São Paulo)`);
  console.log(`       = ${corte.toISOString()} em UTC\n`);

  if (desfazer) {
    const alvo = await prisma.ticket.findMany({
      where: { createdAt: { lt: corte }, archivedAt: { not: null } },
      select: { id: true },
    });
    if (alvo.length === 0) {
      console.log("Nenhum chamado arquivado nesse recorte.");
      return;
    }
    if (dryRun) {
      console.log(`--dry-run: ${alvo.length} chamados voltariam para a fila.`);
      return;
    }
    const r = await prisma.ticket.updateMany({
      where: { createdAt: { lt: corte }, archivedAt: { not: null } },
      data: { archivedAt: null },
    });
    console.log(`✓ ${r.count} chamados desarquivados`);
    return;
  }

  const alvo = await prisma.ticket.findMany({
    where: { createdAt: { lt: corte }, archivedAt: null },
    select: { id: true, title: true, status: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const restantes = await prisma.ticket.count({
    where: { createdAt: { gte: corte }, archivedAt: null },
  });

  if (alvo.length === 0) {
    console.log("Nenhum chamado anterior ao corte. Nada a fazer.");
    console.log(`Continuam ativos: ${restantes}`);
    return;
  }

  console.log(`Seriam arquivados: ${alvo.length}`);
  console.log(`Continuariam ativos: ${restantes}\n`);

  // Lista o que sai, para a conferência acontecer antes e não depois.
  const amostra = alvo.slice(0, 40);
  for (const t of amostra) {
    const data = t.createdAt.toISOString().slice(0, 10);
    console.log(`  #${String(t.id).padEnd(5)} ${data}  ${t.status.padEnd(12)} ${t.title.slice(0, 52)}`);
  }
  if (alvo.length > amostra.length) {
    console.log(`  ... e mais ${alvo.length - amostra.length}`);
  }

  if (dryRun) {
    console.log("\n--dry-run: nada foi alterado.");
    console.log("Para aplicar, rode o mesmo comando sem --dry-run.");
    return;
  }

  const r = await prisma.ticket.updateMany({
    where: { createdAt: { lt: corte }, archivedAt: null },
    data: { archivedAt: new Date() },
  });

  console.log(`\n✓ ${r.count} chamados arquivados`);
  console.log("  Eles saíram da fila, do painel e das métricas.");
  console.log("  Continuam acessíveis pela URL direta e pelo filtro \"Arquivados\".");
  console.log(`  Para reverter: npx tsx scripts/archive-old-tickets.ts ${dataTexto} --desfazer`);
}

main()
  .catch((error) => {
    console.error("Falha:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
