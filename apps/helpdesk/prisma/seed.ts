import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/password";
import { DEFAULT_BUSINESS_HOURS } from "../src/lib/business-hours";

// Seed idempotente: pode rodar em todo deploy sem duplicar nada. Cria só o que
// o sistema precisa para funcionar no primeiro acesso — as políticas de SLA e
// um administrador. Setores e usuários reais vêm do script de migração.

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// Feriados nacionais fixos + móveis de 2026/2027. A tela de admin edita isso
// depois; aqui só evita que o primeiro mês de operação conte feriado como dia útil.
const FERIADOS = [
  "2026-01-01", "2026-02-16", "2026-02-17", "2026-04-03", "2026-04-21",
  "2026-05-01", "2026-06-04", "2026-09-07", "2026-10-12", "2026-11-02",
  "2026-11-15", "2026-12-25",
  "2027-01-01", "2027-02-08", "2027-02-09", "2027-03-26", "2027-04-21",
  "2027-05-01", "2027-05-27", "2027-09-07", "2027-10-12", "2027-11-02",
  "2027-11-15", "2027-12-25",
];

const baseCalendar = {
  businessHours: DEFAULT_BUSINESS_HOURS,
  holidays: FERIADOS,
  timezone: "America/Sao_Paulo",
};

async function seedSlaPolicies() {
  // Ordem importa: selectPolicy desempata pela especificidade, mas manter os
  // ids estáveis torna a escolha reproduzível.
  const policies = [
    {
      id: 1,
      name: "Padrão — suporte",
      priority: null,
      type: null,
      teamId: null,
      responseMinutes: 4 * 60, // meio dia útil
      resolutionMinutes: 16 * 60, // dois dias úteis
      businessHoursOnly: true,
      pauseOnWaiting: true,
    },
    {
      id: 2,
      name: "Incidente urgente",
      priority: "URGENT" as const,
      type: null,
      teamId: null,
      responseMinutes: 30,
      resolutionMinutes: 4 * 60,
      businessHoursOnly: true,
      pauseOnWaiting: true,
    },
    {
      id: 3,
      name: "Incidente — alta prioridade",
      priority: "HIGH" as const,
      type: null,
      teamId: null,
      responseMinutes: 60,
      resolutionMinutes: 8 * 60,
      businessHoursOnly: true,
      pauseOnWaiting: true,
    },
    {
      id: 4,
      // Demanda de projeto tem prazo de calendário, não de expediente: a
      // pessoa que pediu quer saber a data de entrega, não as horas úteis.
      name: "Demanda de projeto",
      priority: null,
      type: "CHANGE_REQUEST" as const,
      teamId: null,
      responseMinutes: 2 * 24 * 60,
      resolutionMinutes: 15 * 24 * 60,
      businessHoursOnly: false,
      pauseOnWaiting: true,
    },
    {
      id: 5,
      name: "Melhoria",
      priority: null,
      type: "IMPROVEMENT" as const,
      teamId: null,
      responseMinutes: 3 * 24 * 60,
      resolutionMinutes: 30 * 24 * 60,
      businessHoursOnly: false,
      pauseOnWaiting: true,
    },
  ];

  for (const p of policies) {
    await prisma.slaPolicy.upsert({
      where: { id: p.id },
      update: {},
      create: { ...p, ...baseCalendar, active: true },
    });
  }

  console.log(`✓ ${policies.length} políticas de SLA`);
}

async function seedAdmin() {
  const existing = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (existing) {
    console.log(`✓ administrador já existe (${existing.email})`);
    return;
  }

  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    console.log(
      "! nenhum administrador criado — defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD",
    );
    return;
  }

  // O administrador nasce SEM setor, de propósito.
  //
  // Criar um setor aqui ocuparia um id na tabela `teams`, e a migração dos
  // dados legados preserva os ids originais — o setor de id 1 do sistema
  // antigo seria descartado por colisão, sem ninguém perceber. O admin
  // escolhe o setor depois, na tela de usuários.
  await prisma.user.create({
    data: {
      name: process.env.SEED_ADMIN_NAME ?? "Administrador",
      email,
      passwordHash: await hashPassword(password),
      role: "ADMIN",
      teamId: null,
    },
  });

  console.log(`✓ administrador criado: ${email}`);
}

async function main() {
  await seedSlaPolicies();
  await seedAdmin();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
