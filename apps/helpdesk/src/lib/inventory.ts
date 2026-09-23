import type { AssetStatus, AssetType } from "@/generated/prisma/enums";
import { assetTypeLabels } from "./labels";

// Regras do inventário, puras e sem dependência de banco — para o que decide
// status, responsável e o texto do termo poder ser testado isoladamente. A
// gravação mora em assets.ts.

/** Prefixo do patrimônio gerado automaticamente: LM-0001, LM-0002... */
export const TAG_PREFIX = "LM";

export function formatTag(id: number): string {
  return `${TAG_PREFIX}-${String(id).padStart(4, "0")}`;
}

/** Depois deste prazo sem conferência, o equipamento aparece como pendente. */
export const CHECK_OVERDUE_DAYS = 180;

export function isCheckOverdue(lastCheckedAt: Date | null, now: Date = new Date()): boolean {
  if (!lastCheckedAt) return true;
  return now.getTime() - lastCheckedAt.getTime() > CHECK_OVERDUE_DAYS * 86_400_000;
}

export function checkOverdueSince(now: Date = new Date()): Date {
  return new Date(now.getTime() - CHECK_OVERDUE_DAYS * 86_400_000);
}

interface AssetNaming {
  type: AssetType;
  hostname?: string | null;
  brand?: string | null;
  model?: string | null;
}

/**
 * Como o equipamento é chamado na tela. O nome na rede vem primeiro porque é
 * o que o suporte fala ("a RECEPCAO-01 travou"); sem ele, marca e modelo.
 */
export function assetName(asset: AssetNaming): string {
  if (asset.hostname?.trim()) return asset.hostname.trim();
  const marcaModelo = [asset.brand, asset.model].filter((v) => v?.trim()).join(" ");
  return marcaModelo || assetTypeLabels[asset.type];
}

interface AssetSpecs {
  processor?: string | null;
  memory?: string | null;
  storage?: string | null;
  operatingSystem?: string | null;
}

/** Resumo de uma linha: "Core i5 · 16 GB · SSD 256 GB · Windows 11". */
export function specsSummary(asset: AssetSpecs): string {
  return [asset.processor, asset.memory, asset.storage, asset.operatingSystem]
    .map((v) => v?.trim())
    .filter(Boolean)
    .join(" · ");
}

/**
 * Mantém status e responsável coerentes entre si.
 *
 * Os dois vêm do mesmo formulário e podem ser escolhidos em contradição
 * ("em estoque" e com responsável). Em vez de recusar, corrige para o que a
 * escolha do responsável indica — ela é a informação mais deliberada:
 *   - baixado nunca fica com ninguém;
 *   - com responsável e marcado como estoque, está em uso;
 *   - sem responsável e marcado como em uso, voltou para o estoque.
 * Manutenção aceita os dois: a máquina de alguém pode estar no conserto.
 */
export function reconcileAssignment(input: {
  status: AssetStatus;
  assigneeId: number | null;
}): { status: AssetStatus; assigneeId: number | null } {
  if (input.status === "RETIRED") return { status: "RETIRED", assigneeId: null };
  if (input.assigneeId && input.status === "IN_STOCK") {
    return { status: "IN_USE", assigneeId: input.assigneeId };
  }
  if (!input.assigneeId && input.status === "IN_USE") {
    return { status: "IN_STOCK", assigneeId: null };
  }
  return input;
}

// ===================== TERMO =====================

/**
 * Modelo padrão do termo. Editável pela tela de inventário; as chaves entre
 * chaves duplas são preenchidas na emissão.
 *
 * A cláusula do art. 462 §1º da CLT é o que autoriza desconto por dano quando
 * previamente acordado — é a razão de existir do termo, e por isso o texto
 * deve ser revisado pelo RH/jurídico antes do uso.
 */
export const DEFAULT_TERM_TEMPLATE = `TERMO DE RESPONSABILIDADE PELA GUARDA E USO DE EQUIPAMENTO

Eu, {{colaborador}}, {{setor}}, declaro ter recebido da Lab Mattos, a título de empréstimo e para uso exclusivo no exercício das minhas atividades profissionais, o equipamento descrito abaixo, em perfeitas condições de uso.

EQUIPAMENTO
{{equipamento}}

Ao aceitar este termo, comprometo-me a:

1. Utilizar o equipamento apenas para fins profissionais, zelando por sua guarda, limpeza e conservação.
2. Não instalar programas nem alterar configurações de hardware ou de software sem autorização da TI.
3. Não emprestar, ceder ou transferir o equipamento a terceiros, nem retirá-lo das dependências da empresa sem autorização.
4. Comunicar imediatamente à TI, por chamado no HelpDesk, qualquer defeito, dano, perda, furto ou roubo — nos dois últimos casos, apresentando o boletim de ocorrência.
5. Devolver o equipamento e seus acessórios quando solicitado ou no encerramento do meu vínculo com a empresa, nas mesmas condições em que o recebi, ressalvado o desgaste natural pelo uso.

Estou ciente de que, em caso de dano causado por uso inadequado, negligência ou dolo, poderei ser responsabilizado pelo valor do reparo ou da reposição, conforme o art. 462, § 1º, da CLT.

Emitido em {{data}}.`;

/** Chaves aceitas no modelo, com a explicação mostrada na tela de edição. */
export const TERM_PLACEHOLDERS: Array<{ key: string; description: string }> = [
  { key: "colaborador", description: "nome completo de quem recebe" },
  { key: "email", description: "e-mail de quem recebe" },
  { key: "setor", description: "setor da pessoa, ex.: “do setor Financeiro”" },
  { key: "equipamento", description: "bloco com tipo, patrimônio, modelo, série e configuração" },
  { key: "patrimonio", description: "número de patrimônio" },
  { key: "data", description: "data da emissão" },
];

export interface TermAsset extends AssetNaming, AssetSpecs {
  tag: string;
  serialNumber?: string | null;
}

/** O bloco de identificação do equipamento, embutido no texto do termo. */
export function equipmentBlock(asset: TermAsset): string {
  const linhas: Array<[string, string | null | undefined]> = [
    ["Tipo", assetTypeLabels[asset.type]],
    ["Patrimônio", asset.tag],
    ["Marca/modelo", [asset.brand, asset.model].filter((v) => v?.trim()).join(" ") || null],
    ["Nome na rede", asset.hostname],
    ["Nº de série", asset.serialNumber],
    ["Configuração", specsSummary(asset) || null],
  ];
  return linhas
    .filter(([, valor]) => valor?.trim())
    .map(([rotulo, valor]) => `${rotulo}: ${valor!.trim()}`)
    .join("\n");
}

/**
 * Preenche o modelo. Uma chave desconhecida fica como está, visível no texto:
 * um erro de digitação no modelo precisa aparecer para quem revisa, não virar
 * um buraco silencioso no meio de uma cláusula.
 */
export function renderTerm(
  template: string,
  vars: {
    colaborador: string;
    email: string;
    setor: string | null;
    asset: TermAsset;
    data: string;
  },
): string {
  const valores: Record<string, string> = {
    colaborador: vars.colaborador,
    email: vars.email,
    setor: vars.setor ? `do setor ${vars.setor}` : "colaborador(a) da empresa",
    equipamento: equipmentBlock(vars.asset),
    patrimonio: vars.asset.tag,
    data: vars.data,
  };
  return template
    .replace(/\r\n/g, "\n")
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (inteiro, chave: string) =>
      valores[chave.toLowerCase()] ?? inteiro,
    )
    .trim();
}

// ===================== ASSINATURA =====================

/** Uma assinatura desenhada num canvas típico ocupa 5–40 KB; 400 KB é folga. */
export const MAX_SIGNATURE_CHARS = 400_000;

const PNG_PREFIX = "data:image/png;base64,";
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Confere que a assinatura recebida é de fato um PNG em data URL.
 *
 * O valor é exibido depois como <img src>, então aceitar qualquer texto
 * permitiria gravar um data URL de outro tipo (SVG com script, por exemplo).
 * O prefixo sozinho não basta — os bytes precisam começar com a assinatura
 * de arquivo PNG.
 */
export function isValidSignature(dataUrl: string): boolean {
  if (!dataUrl.startsWith(PNG_PREFIX)) return false;
  if (dataUrl.length > MAX_SIGNATURE_CHARS) return false;

  const base64 = dataUrl.slice(PNG_PREFIX.length);
  if (!/^[A-Za-z0-9+/]+=*$/.test(base64)) return false;

  const bytes = Buffer.from(base64, "base64");
  if (bytes.length < 100) return false;
  return PNG_MAGIC.every((b, i) => bytes[i] === b);
}

/**
 * IP de quem assinou. Atrás do Cloudflare e do Nginx, o endereço da conexão é
 * o do proxy; o do usuário vem no cabeçalho que o Cloudflare acrescenta, com
 * os padrões do Nginx como reserva.
 */
export function clientIp(headers: { get(name: string): string | null }): string | null {
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return null;
}
