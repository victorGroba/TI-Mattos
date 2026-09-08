import { scrypt, pbkdf2, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";

// Os usuários importados do Flask trazem hashes do Werkzeug. Em vez de forçar
// todo mundo a redefinir a senha, verificamos os dois formatos e reescrevemos
// para bcrypt no primeiro login que der certo (ver needsRehash).
//
// Formatos aceitos:
//   scrypt:N:r:p$salt$hexhash        (Werkzeug >= 2.3, padrão atual)
//   pbkdf2:sha256:iter$salt$hexhash  (Werkzeug antigo)
//   $2a$/$2b$...                     (bcrypt, senhas criadas aqui)

const BCRYPT_ROUNDS = 12;

// scrypt com N=32768, r=8 aloca 128*N*r = 32 MB. O limite padrão do Node é
// exatamente 32 MB, o que faz a chamada falhar por um byte — daí o teto maior.
const SCRYPT_MAXMEM = 96 * 1024 * 1024;

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}

function verifyWerkzeugScrypt(
  password: string,
  params: string,
  salt: string,
  expected: string,
): Promise<boolean> {
  const [n, r, p] = params.split(":").map(Number);
  if (!n || !r || !p) return Promise.resolve(false);

  return new Promise((resolve) => {
    scrypt(
      password,
      salt,
      64, // dklen usado pelo Werkzeug
      { N: n, r, p, maxmem: SCRYPT_MAXMEM },
      (err, derived) => {
        if (err) return resolve(false);
        resolve(safeEqualHex(derived.toString("hex"), expected));
      },
    );
  });
}

function verifyWerkzeugPbkdf2(
  password: string,
  params: string,
  salt: string,
  expected: string,
): Promise<boolean> {
  // params vem como "sha256:600000"
  const [digest, iterations] = params.split(":");
  const rounds = Number(iterations);
  if (!digest || !rounds) return Promise.resolve(false);

  return new Promise((resolve) => {
    pbkdf2(password, salt, rounds, expected.length / 2, digest, (err, derived) => {
      if (err) return resolve(false);
      resolve(safeEqualHex(derived.toString("hex"), expected));
    });
  });
}

/** Verifica a senha contra qualquer um dos formatos suportados. */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) return false;

  if (hash.startsWith("$2")) {
    return bcrypt.compare(password, hash);
  }

  // Werkzeug: "metodo[:params]$salt$hash"
  const parts = hash.split("$");
  if (parts.length !== 3) return false;
  const [method, salt, expected] = parts;

  if (method.startsWith("scrypt:")) {
    return verifyWerkzeugScrypt(password, method.slice("scrypt:".length), salt, expected);
  }
  if (method.startsWith("pbkdf2:")) {
    return verifyWerkzeugPbkdf2(password, method.slice("pbkdf2:".length), salt, expected);
  }

  return false;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/** true para hashes legados, que devem ser reescritos após um login válido. */
export function needsRehash(hash: string): boolean {
  return !hash.startsWith("$2");
}
