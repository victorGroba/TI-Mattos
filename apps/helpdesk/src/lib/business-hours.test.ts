import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CALENDAR,
  addBusinessMinutes,
  businessMinutesBetween,
  zonedTimeToUtc,
  type BusinessCalendar,
} from "./business-hours";

// São Paulo é UTC-3 o ano todo (o horário de verão acabou em 2019), então as
// datas UTC abaixo são explícitas de propósito: se o cálculo passasse a usar o
// fuso do servidor em vez do fuso do calendário, estes testes quebrariam.
// 2026-09-04 é sexta-feira; 2026-09-07 é segunda.
const at = (iso: string) => new Date(iso);

test("conta minutos dentro de um mesmo expediente", () => {
  // Segunda, 09:00 → 11:00 local
  const minutes = businessMinutesBetween(
    at("2026-09-07T12:00:00Z"),
    at("2026-09-07T14:00:00Z"),
  );
  assert.equal(minutes, 120);
});

test("desconta o intervalo de almoço", () => {
  // Segunda, 11:00 → 14:00 local: 1h antes do almoço + 1h depois
  const minutes = businessMinutesBetween(
    at("2026-09-07T14:00:00Z"),
    at("2026-09-07T17:00:00Z"),
  );
  assert.equal(minutes, 120);
});

test("não conta o fim de semana", () => {
  // Sexta 17:00 (fim do expediente) → segunda 09:00 local = 1h útil
  const minutes = businessMinutesBetween(
    at("2026-09-04T20:00:00Z"),
    at("2026-09-07T12:00:00Z"),
  );
  assert.equal(minutes, 60);
});

test("ignora tempo fora do expediente", () => {
  // Segunda 22:00 → terça 06:00 local: nada de expediente no meio
  const minutes = businessMinutesBetween(
    at("2026-09-08T01:00:00Z"),
    at("2026-09-08T09:00:00Z"),
  );
  assert.equal(minutes, 0);
});

test("soma uma semana inteira de expediente", () => {
  // Segunda 00:00 → sábado 00:00 local.
  // Seg-qui: 9h/dia = 36h; sexta: 8h. Total 44h = 2640 min.
  const minutes = businessMinutesBetween(
    at("2026-09-07T03:00:00Z"),
    at("2026-09-12T03:00:00Z"),
  );
  assert.equal(minutes, 44 * 60);
});

test("pula feriados", () => {
  const comFeriado: BusinessCalendar = {
    ...DEFAULT_CALENDAR,
    holidays: ["2026-09-07"], // Independência, uma segunda
  };
  // Sexta 17:00 → terça 09:00 local. Com a segunda de feriado, sobra 1h na terça.
  const minutes = businessMinutesBetween(
    at("2026-09-04T20:00:00Z"),
    at("2026-09-08T12:00:00Z"),
    comFeriado,
  );
  assert.equal(minutes, 60);
});

test("retorna zero quando o fim não é depois do início", () => {
  const t = at("2026-09-07T12:00:00Z");
  assert.equal(businessMinutesBetween(t, t), 0);
  assert.equal(businessMinutesBetween(at("2026-09-07T14:00:00Z"), t), 0);
});

test("addBusinessMinutes atravessa o fim de semana", () => {
  // Sexta 16:00 local + 2h úteis: 1h até as 17h, 1h na segunda de manhã.
  const due = addBusinessMinutes(at("2026-09-04T19:00:00Z"), 120);
  assert.equal(due.toISOString(), "2026-09-07T12:00:00.000Z"); // segunda 09:00 local
});

test("addBusinessMinutes empurra um início fora do expediente para o próximo turno", () => {
  // Domingo 10:00 local + 30 min → segunda 08:30 local
  const due = addBusinessMinutes(at("2026-09-06T13:00:00Z"), 30);
  assert.equal(due.toISOString(), "2026-09-07T11:30:00.000Z");
});

test("addBusinessMinutes é o inverso de businessMinutesBetween", () => {
  const start = at("2026-09-07T12:00:00Z"); // segunda 09:00 local
  for (const minutes of [15, 90, 240, 600, 2000]) {
    const end = addBusinessMinutes(start, minutes);
    assert.equal(
      businessMinutesBetween(start, end),
      minutes,
      `divergiu em ${minutes} minutos`,
    );
  }
});

test("zonedTimeToUtc resolve o horário local de São Paulo", () => {
  const d = zonedTimeToUtc(2026, 9, 7, 8, 0, "America/Sao_Paulo");
  assert.equal(d.toISOString(), "2026-09-07T11:00:00.000Z");
});

test("respeita um calendário 24/7", () => {
  const sempre: BusinessCalendar = {
    timezone: "America/Sao_Paulo",
    holidays: [],
    businessHours: Object.fromEntries(
      ["1", "2", "3", "4", "5", "6", "7"].map((d) => [d, [["00:00", "24:00"]]]),
    ),
  };
  // 24 horas corridas num sábado
  const minutes = businessMinutesBetween(
    at("2026-09-05T03:00:00Z"),
    at("2026-09-06T03:00:00Z"),
    sempre,
  );
  assert.equal(minutes, 24 * 60);
});
