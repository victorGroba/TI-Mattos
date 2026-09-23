import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TERM_TEMPLATE,
  assetName,
  clientIp,
  equipmentBlock,
  formatTag,
  isCheckOverdue,
  isValidSignature,
  reconcileAssignment,
  renderTerm,
  specsSummary,
} from "./inventory";

const notebook = {
  type: "NOTEBOOK" as const,
  tag: "LM-0012",
  hostname: "FIN-NOTE-02",
  brand: "Dell",
  model: "Latitude 3420",
  serialNumber: "7XK2M93",
  processor: "Core i5-1135G7",
  memory: "16 GB",
  storage: "SSD 256 GB",
  operatingSystem: "Windows 11 Pro",
};

test("patrimônio gerado tem quatro dígitos e cresce além deles", () => {
  assert.equal(formatTag(7), "LM-0007");
  assert.equal(formatTag(12345), "LM-12345");
});

test("nome do equipamento prefere o nome na rede, depois marca e modelo", () => {
  assert.equal(assetName(notebook), "FIN-NOTE-02");
  assert.equal(assetName({ ...notebook, hostname: "  " }), "Dell Latitude 3420");
  assert.equal(assetName({ type: "PRINTER" }), "Impressora");
});

test("resumo de configuração ignora campos vazios", () => {
  assert.equal(specsSummary(notebook), "Core i5-1135G7 · 16 GB · SSD 256 GB · Windows 11 Pro");
  assert.equal(specsSummary({ memory: "8 GB", storage: "" }), "8 GB");
  assert.equal(specsSummary({}), "");
});

test("baixado nunca fica com responsável", () => {
  assert.deepEqual(reconcileAssignment({ status: "RETIRED", assigneeId: 3 }), {
    status: "RETIRED",
    assigneeId: null,
  });
});

test("definir responsável tira do estoque, e remover devolve", () => {
  assert.deepEqual(reconcileAssignment({ status: "IN_STOCK", assigneeId: 3 }), {
    status: "IN_USE",
    assigneeId: 3,
  });
  assert.deepEqual(reconcileAssignment({ status: "IN_USE", assigneeId: null }), {
    status: "IN_STOCK",
    assigneeId: null,
  });
});

test("manutenção aceita ter ou não responsável", () => {
  for (const assigneeId of [3, null]) {
    assert.deepEqual(reconcileAssignment({ status: "MAINTENANCE", assigneeId }), {
      status: "MAINTENANCE",
      assigneeId,
    });
  }
});

test("conferência vence depois de 180 dias, e nunca conferido já está vencido", () => {
  const agora = new Date("2026-09-23T12:00:00Z");
  assert.equal(isCheckOverdue(null, agora), true);
  assert.equal(isCheckOverdue(new Date("2026-06-01T12:00:00Z"), agora), false);
  assert.equal(isCheckOverdue(new Date("2026-01-01T12:00:00Z"), agora), true);
});

test("bloco do equipamento omite linhas sem valor", () => {
  const bloco = equipmentBlock({ type: "MONITOR", tag: "LM-0003", brand: "LG" });
  assert.equal(bloco, "Tipo: Monitor\nPatrimônio: LM-0003\nMarca/modelo: LG");
});

test("termo padrão sai preenchido, sem nenhuma chave sobrando", () => {
  const texto = renderTerm(DEFAULT_TERM_TEMPLATE, {
    colaborador: "Maria Souza",
    email: "maria@labmattos.com.br",
    setor: "Financeiro",
    asset: notebook,
    data: "23/09/2026",
  });
  assert.match(texto, /Eu, Maria Souza, do setor Financeiro, declaro/);
  assert.match(texto, /Patrimônio: LM-0012/);
  assert.match(texto, /Nº de série: 7XK2M93/);
  assert.match(texto, /Emitido em 23\/09\/2026\.$/);
  assert.doesNotMatch(texto, /\{\{/);
});

test("chave desconhecida fica visível em vez de sumir", () => {
  const texto = renderTerm("Olá {{colaborador}}, {{cargo}}.", {
    colaborador: "Ana",
    email: "a@x",
    setor: null,
    asset: notebook,
    data: "hoje",
  });
  assert.equal(texto, "Olá Ana, {{cargo}}.");
});

test("assinatura precisa ser PNG de verdade", () => {
  // Cabeçalho PNG seguido de bytes quaisquer: a checagem é do formato, não
  // da imagem inteira.
  const cabecalho = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const bytes = Buffer.concat([cabecalho, Buffer.alloc(200, 1)]);
  const valido = `data:image/png;base64,${bytes.toString("base64")}`;
  assert.equal(isValidSignature(valido), true);

  assert.equal(isValidSignature("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="), false);
  assert.equal(isValidSignature(`data:image/png;base64,${"A".repeat(300)}`), false);
  assert.equal(isValidSignature("data:image/png;base64,<script>"), false);
  assert.equal(isValidSignature(""), false);
});

test("IP vem do Cloudflare antes dos cabeçalhos do Nginx", () => {
  const h = (valores: Record<string, string>) => ({ get: (n: string) => valores[n] ?? null });
  assert.equal(clientIp(h({ "cf-connecting-ip": "200.1.1.1", "x-real-ip": "172.16.0.1" })), "200.1.1.1");
  assert.equal(clientIp(h({ "x-forwarded-for": "200.2.2.2, 10.0.0.1" })), "200.2.2.2");
  assert.equal(clientIp(h({})), null);
});
