import { test } from "node:test";
import assert from "node:assert/strict";
import type { SlaPolicyModel as SlaPolicy } from "@/generated/prisma/models";
import {
  computeDeadlines,
  elapsedMinutes,
  extendDeadlineForPause,
  isTerminal,
  isWaiting,
  selectPolicy,
  slaHealth,
} from "./sla";
import { DEFAULT_BUSINESS_HOURS } from "./business-hours";

function policy(overrides: Partial<SlaPolicy> = {}): SlaPolicy {
  return {
    id: 1,
    name: "padrão",
    priority: null,
    type: null,
    teamId: null,
    responseMinutes: 60,
    resolutionMinutes: 480,
    businessHoursOnly: true,
    pauseOnWaiting: true,
    businessHours: DEFAULT_BUSINESS_HOURS,
    holidays: [],
    timezone: "America/Sao_Paulo",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  } as SlaPolicy;
}

test("escolhe a política mais específica que casa", () => {
  const generica = policy({ id: 1 });
  const porPrioridade = policy({ id: 2, priority: "URGENT" });
  const porSetor = policy({ id: 3, teamId: 5 });

  const escolhida = selectPolicy([generica, porPrioridade, porSetor], {
    teamId: 5,
    type: "SUPPORT",
    priority: "URGENT",
  });

  // Setor pesa mais que prioridade: a exceção do setor vence.
  assert.equal(escolhida?.id, 3);
});

test("descarta políticas que não casam", () => {
  const outroSetor = policy({ id: 2, teamId: 99 });
  const generica = policy({ id: 1 });

  const escolhida = selectPolicy([outroSetor, generica], {
    teamId: 5,
    type: "SUPPORT",
    priority: "LOW",
  });
  assert.equal(escolhida?.id, 1);
});

test("ignora políticas inativas", () => {
  const escolhida = selectPolicy([policy({ id: 1, active: false })], {
    teamId: 1,
    type: "SUPPORT",
    priority: "LOW",
  });
  assert.equal(escolhida, null);
});

test("retorna null quando nada casa", () => {
  const escolhida = selectPolicy([policy({ id: 1, type: "INCIDENT" })], {
    teamId: 1,
    type: "CHANGE_REQUEST",
    priority: "LOW",
  });
  assert.equal(escolhida, null);
});

test("calcula prazos em horário útil", () => {
  // Sexta 16:00 local. Resposta em 60 min úteis → sexta 17:00 local.
  const criado = new Date("2026-09-04T19:00:00Z");
  const prazos = computeDeadlines(policy({ responseMinutes: 60 }), criado);
  assert.equal(prazos.responseDueAt?.toISOString(), "2026-09-04T20:00:00.000Z");
});

test("calcula prazos em tempo corrido quando a política não usa horário útil", () => {
  const criado = new Date("2026-09-04T19:00:00Z");
  const prazos = computeDeadlines(
    policy({ businessHoursOnly: false, responseMinutes: 120 }),
    criado,
  );
  assert.equal(prazos.responseDueAt?.toISOString(), "2026-09-04T21:00:00.000Z");
});

test("sem política, não há prazo", () => {
  const prazos = computeDeadlines(null, new Date());
  assert.deepEqual(prazos, {
    slaPolicyId: null,
    responseDueAt: null,
    resolutionDueAt: null,
  });
});

test("empurra o prazo pelo tempo em espera", () => {
  // Prazo em segunda 09:00 local; 60 min úteis de pausa → segunda 10:00.
  const prazo = new Date("2026-09-07T12:00:00Z");
  const novo = extendDeadlineForPause(prazo, 60, policy());
  assert.equal(novo?.toISOString(), "2026-09-07T13:00:00.000Z");
});

test("não empurra o prazo quando a política não pausa", () => {
  const prazo = new Date("2026-09-07T12:00:00Z");
  const novo = extendDeadlineForPause(prazo, 600, policy({ pauseOnWaiting: false }));
  assert.equal(novo?.toISOString(), prazo.toISOString());
});

test("mede o tempo decorrido na régua da política", () => {
  const de = new Date("2026-09-04T20:00:00Z"); // sexta 17:00 local
  const ate = new Date("2026-09-07T12:00:00Z"); // segunda 09:00 local

  assert.equal(elapsedMinutes(de, ate, policy()), 60);
  assert.equal(elapsedMinutes(de, ate, policy({ businessHoursOnly: false })), 64 * 60);
});

test("classifica a saúde do prazo", () => {
  const criado = new Date("2026-09-07T12:00:00Z");
  const prazo = new Date("2026-09-07T22:00:00Z"); // 10h depois

  assert.equal(slaHealth(new Date("2026-09-07T14:00:00Z"), criado, prazo, false), "ok");
  assert.equal(
    slaHealth(new Date("2026-09-07T21:00:00Z"), criado, prazo, false),
    "warning",
  );
  assert.equal(
    slaHealth(new Date("2026-09-07T23:00:00Z"), criado, prazo, false),
    "breached",
  );
  assert.equal(slaHealth(new Date(), criado, null, false), "none");
  // A marcação explícita de estouro vence o cálculo por tempo.
  assert.equal(slaHealth(new Date("2026-09-07T13:00:00Z"), criado, prazo, true), "breached");
});

test("classifica os status de espera e finais", () => {
  assert.equal(isWaiting("WAITING_REQUESTER"), true);
  assert.equal(isWaiting("IN_PROGRESS"), false);
  assert.equal(isTerminal("CLOSED"), true);
  assert.equal(isTerminal("RESOLVED"), true);
  assert.equal(isTerminal("OPEN"), false);
});
