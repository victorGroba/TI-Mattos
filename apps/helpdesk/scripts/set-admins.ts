import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// Define exatamente quem é administrador. Todos os demais viram usuário comum.
//
// Existe porque papel é a decisão mais fácil de errar por acumulação: alguém
// promove uma conta para resolver um problema pontual e ninguém rebaixa depois.
// Passar a lista completa deixa o resultado explícito, em vez de depender do
// que já estava lá.
//
// Uso:
//   npx tsx scripts/set-admins.ts ti@labmattos.com.br rmattos@labmattos.com.br

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const emails = process.argv.slice(2).map((e) => e.toLowerCase().trim()).filter(Boolean);

  if (emails.length === 0) {
    console.error("Informe ao menos um e-mail de administrador.");
    console.error("  npx tsx scripts/set-admins.ts ti@labmattos.com.br outro@labmattos.com.br");
    process.exit(1);
  }

  const found = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true, email: true, name: true },
  });

  // Um e-mail digitado errado deixaria o sistema com menos administradores do
  // que o pretendido — possivelmente nenhum. Melhor abortar sem tocar em nada.
  const missing = emails.filter((e) => !found.some((u) => u.email === e));
  if (missing.length > 0) {
    console.error("Estes e-mails não existem no sistema:");
    for (const m of missing) console.error(`  - ${m}`);
    console.error("\nNada foi alterado.");
    process.exit(1);
  }

  const ids = found.map((u) => u.id);

  const [promoted, demoted] = await prisma.$transaction([
    prisma.user.updateMany({ where: { id: { in: ids } }, data: { role: "ADMIN" } }),
    prisma.user.updateMany({
      where: { id: { notIn: ids }, role: "ADMIN" },
      data: { role: "USER" },
    }),
  ]);

  console.log("Administradores:");
  for (const u of found) console.log(`  ✓ ${u.name} <${u.email}>`);
  console.log(`\n${promoted.count} confirmados, ${demoted.count} rebaixados para usuário comum.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
