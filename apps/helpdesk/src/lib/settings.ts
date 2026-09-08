import { prisma } from "./prisma";

// Configurações globais, guardadas na tabela `settings` para poderem mudar sem
// redeploy.

const DEFAULT_TEAM_KEY = "default_team_id";

/**
 * Setor que atende os chamados.
 *
 * Todo chamado cai aqui — no Lab Mattos, o suporte é centralizado na TI. O
 * setor de QUEM PEDE não é perguntado: ele já está no cadastro da pessoa, e é
 * por ele que os relatórios respondem "quais setores mais abrem chamado", que
 * é a pergunta útil.
 *
 * Resolve nesta ordem: a configuração salva, depois um setor de slug "ti", e
 * por último o primeiro setor ativo — para o sistema nunca ficar sem destino.
 */
export async function getDefaultTeamId(): Promise<number> {
  const setting = await prisma.setting.findUnique({
    where: { key: DEFAULT_TEAM_KEY },
  });

  const saved = Number(setting?.value);
  if (Number.isInteger(saved) && saved > 0) {
    const existe = await prisma.team.findFirst({
      where: { id: saved, active: true },
      select: { id: true },
    });
    if (existe) return existe.id;
  }

  const ti = await prisma.team.findFirst({
    where: { active: true, slug: "ti" },
    select: { id: true },
  });
  if (ti) return ti.id;

  const primeiro = await prisma.team.findFirst({
    where: { active: true },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  if (primeiro) return primeiro.id;

  throw new Error("Nenhum setor ativo cadastrado para receber chamados.");
}

export async function setDefaultTeamId(teamId: number): Promise<void> {
  await prisma.setting.upsert({
    where: { key: DEFAULT_TEAM_KEY },
    update: { value: teamId },
    create: { key: DEFAULT_TEAM_KEY, value: teamId },
  });
}
