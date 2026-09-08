import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// Reproduz a rajada de consultas paralelas do painel para medir o limite real
// de concorrência do banco configurado.
const max = Number(process.env.DATABASE_POOL_MAX ?? 10);
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, max }),
});

async function main() {
  console.log(`pool max = ${max}`);
  try {
    const r = await Promise.all([
      prisma.ticket.count(),
      prisma.ticket.count({ where: { status: "OPEN" } }),
      prisma.ticket.count({ where: { assigneeId: null } }),
      prisma.ticket.aggregate({ _count: { _all: true }, _avg: { resolutionMinutes: true } }),
      prisma.ticket.aggregate({ _avg: { firstResponseMinutes: true } }),
      prisma.ticket.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.ticket.groupBy({ by: ["priority"], _count: { _all: true } }),
      prisma.ticket.groupBy({ by: ["teamId"], _count: { _all: true } }),
      prisma.ticketStatusPeriod.groupBy({ by: ["status"], _avg: { businessMinutes: true }, _count: { _all: true } }),
      prisma.team.findMany(),
      prisma.ticket.findMany({ take: 5 }),
      prisma.user.findMany({ take: 5 }),
    ]);
    console.log(`✓ ${r.length} consultas paralelas OK`);
  } catch (e) {
    console.log(`✗ FALHOU: ${e instanceof Error ? e.message.split("\n").pop() : e}`);
  }
}

main().finally(() => prisma.$disconnect());
