-- Reduz os papéis de quatro para dois: ADMIN e USER.
--
-- MANAGER e AGENT existiam para o caso de times diferentes atenderem filas
-- diferentes. Aqui o suporte é centralizado, então esses níveis só criavam
-- regra para errar — e, na prática, deixavam qualquer AGENT enxergando a fila
-- inteira da empresa, igual a um administrador.
--
-- O Postgres não permite remover valor de um enum em uso, então o caminho é
-- criar o tipo novo, converter a coluna e trocar.

-- 1. Tipo novo.
CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'USER');

-- 2. Converte a coluna. Só quem já era ADMIN permanece ADMIN; MANAGER, AGENT e
--    REQUESTER viram USER. Rebaixar por padrão é o lado seguro do erro: dar
--    acesso a mais seria pior que pedir para um admin promover de volta.
ALTER TABLE "users"
  ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "Role_new"
  USING (CASE WHEN "role"::text = 'ADMIN' THEN 'ADMIN' ELSE 'USER' END)::"Role_new";

ALTER TABLE "users"
  ALTER COLUMN "role" SET DEFAULT 'USER';

-- 3. Substitui o tipo antigo.
DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";
