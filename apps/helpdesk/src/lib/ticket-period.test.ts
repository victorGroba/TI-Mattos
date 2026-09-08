import { test } from "node:test";
import assert from "node:assert/strict";
import { periodStart } from "./ticket-where";

// Recortes de calendário no fuso de São Paulo (UTC-3).
//
// A armadilha aqui é o container rodar em UTC: usar o relógio dele jogaria as
// três primeiras horas de cada dia brasileiro para o dia anterior — um chamado
// aberto às 00h30 não apareceria no filtro "hoje".
//
// As datas UTC abaixo são explícitas de propósito: se o cálculo passasse a
// depender do fuso do servidor, estes testes quebrariam.

// 2026-09-09 é uma quarta-feira.
const quarta10h = new Date("2026-09-09T13:00:00Z"); // 10:00 em São Paulo

test("hoje começa à meia-noite de São Paulo, não de UTC", () => {
  const inicio = periodStart("hoje", quarta10h);
  assert.equal(inicio?.toISOString(), "2026-09-09T03:00:00.000Z");
});

test("hoje ainda é o dia certo às 00h30 do horário brasileiro", () => {
  // 03:30 UTC = 00:30 em São Paulo, já no dia 9.
  const inicio = periodStart("hoje", new Date("2026-09-09T03:30:00Z"));
  assert.equal(inicio?.toISOString(), "2026-09-09T03:00:00.000Z");
});

test("hoje, às 23h de São Paulo, não pula para o dia seguinte", () => {
  // 2026-09-10T02:00Z = 23:00 do dia 9 em São Paulo.
  const inicio = periodStart("hoje", new Date("2026-09-10T02:00:00Z"));
  assert.equal(inicio?.toISOString(), "2026-09-09T03:00:00.000Z");
});

test("a semana começa na segunda", () => {
  // Quarta 09/09 → segunda 07/09.
  const inicio = periodStart("semana", quarta10h);
  assert.equal(inicio?.toISOString(), "2026-09-07T03:00:00.000Z");
});

test("na segunda, a semana é o próprio dia", () => {
  const segunda = new Date("2026-09-07T13:00:00Z");
  assert.equal(
    periodStart("semana", segunda)?.toISOString(),
    "2026-09-07T03:00:00.000Z",
  );
});

test("no domingo, a semana ainda é a que começou na segunda anterior", () => {
  // 2026-09-13 é domingo; a semana começou em 07/09.
  const domingo = new Date("2026-09-13T13:00:00Z");
  assert.equal(
    periodStart("semana", domingo)?.toISOString(),
    "2026-09-07T03:00:00.000Z",
  );
});

test("o mês começa no dia 1", () => {
  const inicio = periodStart("mes", quarta10h);
  assert.equal(inicio?.toISOString(), "2026-09-01T03:00:00.000Z");
});

test("no dia 1, o mês é o próprio dia", () => {
  const primeiro = new Date("2026-09-01T13:00:00Z");
  assert.equal(
    periodStart("mes", primeiro)?.toISOString(),
    "2026-09-01T03:00:00.000Z",
  );
});

test("90 dias conta a partir da meia-noite, não da hora atual", () => {
  const inicio = periodStart("90dias", quarta10h);
  // 90 dias antes de 2026-09-09T03:00Z.
  assert.equal(inicio?.toISOString(), "2026-06-11T03:00:00.000Z");
});

test("todo o período não gera recorte", () => {
  assert.equal(periodStart("tudo", quarta10h), null);
});
