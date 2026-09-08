import "dotenv/config";
import { DatabaseSync } from "node:sqlite";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { uniqueSlug } from "../src/lib/slug";

// Migra setores, usuários e categorias do HelpDesk em Flask/SQLite para o
// Postgres da v2.
//
// Escopo decidido com o time: chamados e respostas antigos NÃO vêm junto — o
// banco legado fica arquivado como histórico. O que precisa vir é o cadastro,
// para ninguém ter que recriar conta nem recadastrar senha.
//
// Uso:
//   npx tsx scripts/migrate-legacy.ts /caminho/para/helpdesk.db [--dry-run]
//
// É idempotente: rodar duas vezes não duplica nada. Os IDs originais são
// preservados, então referências anotadas fora do sistema continuam valendo.
//
// A leitura usa o módulo `node:sqlite`, embutido no Node 24, e não a biblioteca
// better-sqlite3: aquela precisa compilar código nativo com node-gyp, o que
// exige Python e compilador dentro da imagem Docker — peso e tempo de build
// para um script que roda uma única vez.

interface LegacySetor {
  id: number;
  nome: string;
  email: string | null;
}

interface LegacyUser {
  id: number;
  nome: string;
  email: string;
  senha_hash: string;
  tipo: string; // 'admin' | 'usuario'
  setor_id: number | null;
}

interface LegacyCategoria {
  id: number;
  nome: string;
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/**
 * O sistema antigo só tinha 'admin' e 'usuario'. ADMIN vira ADMIN; todo o
 * resto entra como REQUESTER, e quem for atender é promovido a AGENT na tela
 * de usuários — é mais seguro subestimar permissão do que dar demais.
 */
function mapRole(tipo: string): "ADMIN" | "USER" {
  return tipo?.toLowerCase() === "admin" ? "ADMIN" : "USER";
}

/**
 * Os IDs foram inseridos manualmente, então as sequences do Postgres ainda
 * estão em 1. Sem este acerto, o primeiro INSERT normal colidiria com uma
 * chave já usada.
 */
async function resyncSequences(tables: string[]) {
  for (const table of tables) {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'),
              GREATEST((SELECT COALESCE(MAX(id), 0) FROM "${table}"), 1))`,
    );
  }
}

async function main() {
  const dbPath = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");

  if (!dbPath) {
    console.error("Informe o caminho do helpdesk.db legado.");
    console.error("  npx tsx scripts/migrate-legacy.ts ./instance/helpdesk.db [--dry-run]");
    process.exit(1);
  }

  // readOnly também garante que o arquivo exista: abrir um caminho inexistente
  // em modo leitura falha, em vez de criar um banco vazio silenciosamente.
  const legacy = new DatabaseSync(dbPath, { readOnly: true });

  const setores = legacy.prepare("SELECT id, nome, email FROM setor ORDER BY id").all() as unknown as LegacySetor[];
  const usuarios = legacy
    .prepare("SELECT id, nome, email, senha_hash, tipo, setor_id FROM user ORDER BY id")
    .all() as unknown as LegacyUser[];
  const categorias = legacy
    .prepare("SELECT id, nome FROM categoria ORDER BY id")
    .all() as unknown as LegacyCategoria[];

  const chamados = (
    legacy.prepare("SELECT COUNT(*) AS n FROM ticket").get() as unknown as { n: number }
  ).n;

  console.log(`Origem: ${dbPath}`);
  console.log(`  setores:    ${setores.length}`);
  console.log(`  usuários:   ${usuarios.length}`);
  console.log(`  categorias: ${categorias.length}`);
  console.log(`  chamados:   ${chamados} (não migrados — permanecem no arquivo legado)`);
  console.log("");

  if (dryRun) {
    console.log("--dry-run: nada foi gravado.");
    legacy.close();
    return;
  }

  // ---- Setores ----
  const teamSlugs = new Set(
    (await prisma.team.findMany({ select: { slug: true } })).map((t) => t.slug),
  );

  const conflitos: string[] = [];
  let setoresCriados = 0;

  for (const setor of setores) {
    const existing = await prisma.team.findUnique({ where: { id: setor.id } });

    if (existing) {
      // Já existir com o MESMO nome é reexecução do script — normal.
      // Existir com nome diferente significa que outra coisa ocupou este id, e
      // o setor legado seria descartado. Isso precisa aparecer, não ser
      // engolido: já custou o sumiço silencioso do setor "Administrativo".
      if (existing.name !== setor.nome) {
        conflitos.push(
          `id ${setor.id}: legado "${setor.nome}" x existente "${existing.name}"`,
        );
      }
      continue;
    }

    await prisma.team.create({
      data: {
        id: setor.id,
        name: setor.nome,
        slug: uniqueSlug(setor.nome, teamSlugs),
        email: setor.email,
      },
    });
    setoresCriados += 1;
  }

  if (conflitos.length > 0) {
    console.error("");
    console.error("ERRO: ids de setor já ocupados por registros diferentes:");
    for (const c of conflitos) console.error(`  - ${c}`);
    console.error("");
    console.error("Estes setores NÃO foram migrados. Rode a migração num banco");
    console.error("recém-criado (antes de qualquer cadastro manual) ou libere os ids.");
    process.exit(1);
  }

  console.log(`✓ setores migrados: ${setoresCriados} de ${setores.length}`);

  // ---- Categorias ----
  const categorySlugs = new Set(
    (await prisma.category.findMany({ select: { slug: true } })).map((c) => c.slug),
  );

  let categoriasCriadas = 0;
  const conflitosCategoria: string[] = [];

  for (const categoria of categorias) {
    const existing = await prisma.category.findUnique({ where: { id: categoria.id } });

    if (existing) {
      if (existing.name !== categoria.nome) {
        conflitosCategoria.push(
          `id ${categoria.id}: legado "${categoria.nome}" x existente "${existing.name}"`,
        );
      }
      continue;
    }

    await prisma.category.create({
      data: {
        id: categoria.id,
        name: categoria.nome,
        slug: uniqueSlug(categoria.nome, categorySlugs),
      },
    });
    categoriasCriadas += 1;
  }

  if (conflitosCategoria.length > 0) {
    console.error("");
    console.error("ERRO: ids de categoria já ocupados por registros diferentes:");
    for (const c of conflitosCategoria) console.error(`  - ${c}`);
    process.exit(1);
  }

  console.log(`✓ categorias migradas: ${categoriasCriadas} de ${categorias.length}`);

  // ---- Usuários ----
  const teamIds = new Set((await prisma.team.findMany({ select: { id: true } })).map((t) => t.id));
  let criados = 0;
  let pulados = 0;
  const conflitosUsuario: string[] = [];

  for (const user of usuarios) {
    // Mesmo e-mail = mesma pessoa já cadastrada (tipicamente o administrador
    // criado pelo seed). Isso é esperado e não é problema.
    const porEmail = await prisma.user.findUnique({ where: { email: user.email } });
    if (porEmail) {
      pulados += 1;
      continue;
    }

    // Mesmo id com e-mail diferente é outra coisa ocupando a vaga: o usuário
    // legado seria perdido em silêncio.
    const porId = await prisma.user.findUnique({ where: { id: user.id } });
    if (porId) {
      conflitosUsuario.push(
        `id ${user.id}: legado "${user.email}" x existente "${porId.email}"`,
      );
      continue;
    }

    await prisma.user.create({
      data: {
        id: user.id,
        name: user.nome,
        email: user.email,
        // O hash do Werkzeug vem intacto — lib/password.ts valida os dois
        // formatos e reescreve para bcrypt no primeiro login.
        passwordHash: user.senha_hash,
        role: mapRole(user.tipo),
        teamId: user.setor_id && teamIds.has(user.setor_id) ? user.setor_id : null,
      },
    });
    criados += 1;
  }
  if (conflitosUsuario.length > 0) {
    console.error("");
    console.error("ERRO: ids de usuário já ocupados por outras contas:");
    for (const c of conflitosUsuario) console.error(`  - ${c}`);
    process.exit(1);
  }

  console.log(`✓ usuários migrados: ${criados}${pulados ? ` (${pulados} já existiam)` : ""}`);

  await resyncSequences(["teams", "categories", "users"]);
  console.log("✓ sequences do Postgres realinhadas");

  legacy.close();
}

main()
  .catch((error) => {
    console.error("Falha na migração:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
