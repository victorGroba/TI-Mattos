import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyPassword, hashPassword, needsRehash } from "./password";

// Hashes gerados pelo mesmo algoritmo do Werkzeug (hashlib.scrypt / pbkdf2_hmac),
// para garantir que os usuários importados do Flask conseguem logar sem trocar
// a senha.
const PASSWORD = "SenhaTeste123";
const WERKZEUG_SCRYPT =
  "scrypt:32768:8:1$xgdINB9rTL7AwvOi$a852da523b95239cbfe970fb3e893ea3e27dda7340ced50131e684611af505bf6d9b5ab664f60432dadd8a73f8abc6a65b0adedf7564b0ba0a3778212336530d";
const WERKZEUG_PBKDF2 =
  "pbkdf2:sha256:600000$xgdINB9rTL7AwvOi$c11c2940a305ede17428c7dd870ddd47a055485b520ff775955421984165915c";

test("aceita hash scrypt do Werkzeug", async () => {
  assert.equal(await verifyPassword(PASSWORD, WERKZEUG_SCRYPT), true);
  assert.equal(await verifyPassword("senha errada", WERKZEUG_SCRYPT), false);
});

test("aceita hash pbkdf2 do Werkzeug", async () => {
  assert.equal(await verifyPassword(PASSWORD, WERKZEUG_PBKDF2), true);
  assert.equal(await verifyPassword("senha errada", WERKZEUG_PBKDF2), false);
});

test("faz o ciclo completo em bcrypt", async () => {
  const hash = await hashPassword(PASSWORD);
  assert.equal(await verifyPassword(PASSWORD, hash), true);
  assert.equal(await verifyPassword("outra", hash), false);
  assert.equal(needsRehash(hash), false);
});

test("marca hashes legados para reescrita", () => {
  assert.equal(needsRehash(WERKZEUG_SCRYPT), true);
  assert.equal(needsRehash(WERKZEUG_PBKDF2), true);
});

test("rejeita entradas vazias ou malformadas", async () => {
  assert.equal(await verifyPassword("", WERKZEUG_SCRYPT), false);
  assert.equal(await verifyPassword(PASSWORD, ""), false);
  assert.equal(await verifyPassword(PASSWORD, "lixo-sem-formato"), false);
  assert.equal(await verifyPassword(PASSWORD, "md5$salt$abc"), false);
});
