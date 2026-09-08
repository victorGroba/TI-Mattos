import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// Utilitário de inspeção local: mostra quem tem acesso e com qual papel.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true, name: true, email: true, role: true, active: true,
      passwordHash: true, team: { select: { name: true } },
    },
    orderBy: [{ role: "asc" }, { id: "asc" }],
  });

  for (const u of users) {
    // Só o formato do hash, nunca o valor: scrypt = veio do sistema antigo
    // (senha original preservada), bcrypt = definida aqui.
    const origem = u.passwordHash.startsWith("$2") ? "bcrypt (definida na v2)" : "scrypt (senha do sistema antigo)";
    console.log(
      `${String(u.id).padStart(3)} | ${u.role.padEnd(9)} | ${u.email.padEnd(34)} | ` +
        `${(u.team?.name ?? "—").padEnd(16)} | ${u.active ? "ativo " : "inativo"} | ${origem}`,
    );
  }
}

main().finally(() => prisma.$disconnect());
