import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTicketWhere } from "./ticket-where";
import type { SessionUser } from "./rbac";

const comum: SessionUser = {
  id: 7,
  name: "Usuário comum",
  email: "s@labmattos.com.br",
  role: "USER",
  teamId: 2,
};

const admin: SessionUser = {
  id: 3,
  name: "Administrador",
  email: "a@labmattos.com.br",
  role: "ADMIN",
  teamId: 5,
};

test("usuário comum só enxerga o que abriu ou acompanha", () => {
  const where = buildTicketWhere(comum, {});
  assert.deepEqual(where.AND, [
    {
      OR: [{ requesterId: 7 }, { watchers: { some: { userId: 7 } } }],
    },
  ]);
});

test("a busca não pode anular o filtro de visibilidade", () => {
  // Este é o caso que já quebrou uma vez: busca e visibilidade precisam das
  // duas cláusulas OR ao mesmo tempo, em ramos AND separados.
  const where = buildTicketWhere(comum, { search: "servidor" });
  const and = where.AND as Array<Record<string, unknown>>;

  assert.equal(and.length, 2, "visibilidade e busca devem coexistir");

  const visibilidade = and[0].OR as Array<Record<string, unknown>>;
  assert.deepEqual(visibilidade[0], { requesterId: 7 });

  const busca = and[1].OR as Array<Record<string, unknown>>;
  assert.deepEqual(busca[0], { title: { contains: "servidor", mode: "insensitive" } });
});

test("administrador não recebe recorte de visibilidade", () => {
  const where = buildTicketWhere(admin, {});
  assert.equal(where.AND, undefined);
});

test("busca por número procura pelo id", () => {
  const where = buildTicketWhere(admin, { search: "#42" });
  const busca = (where.AND as Array<Record<string, unknown>>)[0].OR as Array<
    Record<string, unknown>
  >;
  assert.deepEqual(busca[0], { id: 42 });
});

test("requesterOnly restringe até para administrador", () => {
  const where = buildTicketWhere(admin, { requesterOnly: true });
  assert.equal(where.requesterId, 3);
});

test("filtro de atraso limita aos que ainda estão em aberto", () => {
  const where = buildTicketWhere(admin, { overdue: true });
  assert.equal(where.slaResolutionBreached, true);
  assert.deepEqual(
    (where.status as { in: string[] }).in.includes("CLOSED"),
    false,
    "atraso não deve incluir chamados encerrados",
  );
});

test("sem responsável tem precedência sobre responsável específico", () => {
  const where = buildTicketWhere(admin, { unassigned: true, assigneeId: 9 });
  assert.equal(where.assigneeId, null);
});

test("busca em branco não gera cláusula", () => {
  const where = buildTicketWhere(admin, { search: "   " });
  assert.equal(where.AND, undefined);
});
