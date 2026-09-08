import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/password";

// Define a senha de um usuário pela linha de comando.
//
// Existe para dois casos reais: recuperar o acesso de alguém que perdeu a
// senha (não há fluxo de "esqueci minha senha" ainda) e definir a senha das
// contas importadas do sistema antigo cujo hash ninguém conhece.
//
// Uso:
//   npx tsx scripts/set-password.ts email@labmattos.com.br NovaSenha123
//   npx tsx scripts/set-password.ts email@labmattos.com.br NovaSenha123 --admin

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const [email, password] = process.argv.slice(2);
  const promote = process.argv.includes("--admin");

  if (!email || !password) {
    console.error("Uso: npx tsx scripts/set-password.ts <email> <senha> [--admin]");
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("A senha precisa ter pelo menos 8 caracteres.");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, name: true, role: true },
  });

  if (!user) {
    console.error(`Nenhum usuário com o e-mail ${email}.`);
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(password),
      active: true,
      ...(promote ? { role: "ADMIN" as const } : {}),
    },
  });

  console.log(`✓ senha definida para ${user.name} <${email}>`);
  if (promote && user.role !== "ADMIN") {
    console.log(`  papel alterado de ${user.role} para ADMIN`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
