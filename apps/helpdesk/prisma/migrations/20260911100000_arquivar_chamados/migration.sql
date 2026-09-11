-- Arquivamento de chamados.
--
-- Tira o chamado da fila e das métricas sem apagar nada: o histórico antigo
-- migrado do sistema em Flask deixa de poluir os indicadores, mas continua
-- consultável. Nulo = ativo.
ALTER TABLE "tickets" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- Quase toda consulta filtra por não-arquivado.
CREATE INDEX "tickets_archivedAt_idx" ON "tickets"("archivedAt");
