import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

// O docker compose escreve `VAR: ${VAR:-}`, que entrega string VAZIA quando a
// variável não está no .env. Para o Zod, vazio é um valor presente: `.optional()`
// não se aplica e qualquer regra (min, url) falha.
//
// Isso derrubou a aplicação inteira em produção — a validação lançava erro na
// importação do módulo e toda requisição virava 500, por causa de um
// CRON_SECRET opcional deixado em branco.
//
// Estes testes travam o comportamento do helper `opcional`. Ele é reproduzido
// aqui, e não importado de env.ts, porque aquele módulo valida process.env na
// importação — carregá-lo num teste exigiria montar um ambiente completo.

function opcional<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((v) => (v === "" ? undefined : v), schema.optional());
}

test("string vazia é tratada como não informada", () => {
  const schema = z.object({ CRON_SECRET: opcional(z.string().min(16)) });

  assert.equal(schema.safeParse({}).success, true, "ausente deve passar");
  assert.equal(
    schema.safeParse({ CRON_SECRET: "" }).success,
    true,
    "vazia deve passar — é como o compose envia o que não foi preenchido",
  );
  assert.equal(schema.parse({ CRON_SECRET: "" }).CRON_SECRET, undefined);
});

test("valor informado continua sendo validado", () => {
  const schema = z.object({ CRON_SECRET: opcional(z.string().min(16)) });

  assert.equal(
    schema.safeParse({ CRON_SECRET: "curto" }).success,
    false,
    "um valor curto de verdade ainda precisa falhar",
  );
  assert.equal(schema.safeParse({ CRON_SECRET: "a".repeat(32) }).success, true);
});

test("o mesmo vale para URL, que falharia com string vazia", () => {
  const schema = z.object({ AUTH_URL: opcional(z.string().url()) });

  assert.equal(schema.safeParse({ AUTH_URL: "" }).success, true);
  assert.equal(schema.safeParse({ AUTH_URL: "nao-e-url" }).success, false);
  assert.equal(schema.safeParse({ AUTH_URL: "https://exemplo.com" }).success, true);
});

test("campo obrigatório continua obrigatório", () => {
  // A folga vale só para o que é opcional: AUTH_SECRET em branco tem de
  // derrubar o deploy, e não passar despercebido.
  const schema = z.object({ AUTH_SECRET: z.string().min(32) });

  assert.equal(schema.safeParse({ AUTH_SECRET: "" }).success, false);
  assert.equal(schema.safeParse({}).success, false);
  assert.equal(schema.safeParse({ AUTH_SECRET: "x".repeat(32) }).success, true);
});
