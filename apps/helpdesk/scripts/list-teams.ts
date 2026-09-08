import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// Utilitário de inspeção local: mostra setores e o que está pendurado neles.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const teams = await prisma.team.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      _count: { select: { tickets: true, members: true, categories: true } },
    },
    orderBy: { id: "asc" },
  });

  for (const t of teams) {
    console.log(
      `${String(t.id).padStart(3)} | ${t.name.padEnd(18)} | ${t.slug.padEnd(16)} | ` +
        `tickets=${t._count.tickets} membros=${t._count.members} cats=${t._count.categories}`,
    );
  }
}

main().finally(() => prisma.$disconnect());
