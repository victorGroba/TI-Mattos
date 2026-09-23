#!/usr/bin/env bash
# Backup diário do HelpDesk v2: dump do Postgres + anexos.
#
# O sistema antigo não tinha backup nenhum — o backup_drive.sh da VPS só cobre
# /var/www/qualigestor e o backup_postgres.sh não conhece este banco. Este
# script fecha essa lacuna.
#
# Instalação na VPS (como root):
#   cp scripts/backup-helpdesk.sh /usr/local/bin/backup-helpdesk
#   chmod +x /usr/local/bin/backup-helpdesk
#   crontab -e   →   15 2 * * *  /usr/local/bin/backup-helpdesk >> /var/log/backup-helpdesk.log 2>&1

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/var/www/helpdesk}"
BACKUP_DIR="${BACKUP_DIR:-${PROJECT_DIR}/backups}"
COMPOSE_FILE="${COMPOSE_FILE:-${PROJECT_DIR}/docker-compose.v2.yml}"
ENV_FILE="${ENV_FILE:-${PROJECT_DIR}/.env.v2}"
# O compose declara `name: helpdesk-v2`, e o Docker prefixa os volumes com o
# nome do projeto: o volume "helpdesk_uploads" do arquivo existe no disco como
# "helpdesk-v2_helpdesk_uploads".
UPLOADS_VOLUME="${UPLOADS_VOLUME:-helpdesk-v2_helpdesk_uploads}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

STAMP="$(date +%Y-%m-%d_%H%M)"
DUMP_FILE="${BACKUP_DIR}/helpdesk_${STAMP}.dump"
UPLOADS_FILE="${BACKUP_DIR}/uploads_${STAMP}.tar.gz"

mkdir -p "${BACKUP_DIR}"

# O arquivo da v2 é .env.v2 — o .env desta pasta é do sistema antigo em
# Flask. Sem ele o compose nem chega a rodar: POSTGRES_PASSWORD é obrigatório
# no docker-compose.v2.yml, e a interpolação falha antes do pg_dump.
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERRO: ${ENV_FILE} não encontrado." >&2
  exit 1
fi

# Lê só as chaves necessárias, sem `source`: o arquivo está no formato do
# Docker, não do bash — uma linha como MAIL_FROM=HelpDesk <ti@...> seria
# executada como comando e derrubaria o script. O arquivo inteiro vai para o
# compose via --env-file, que entende esse formato.
env_value() {
  # `|| true`: chave ausente não é erro (vale o padrão), mas o grep sai com 1
  # e o pipefail derrubaria o script.
  { grep -E "^$1=" "${ENV_FILE}" || true; } | tail -n1 | cut -d= -f2- | tr -d '"'"'"'\r'
}

PG_USER="$(env_value POSTGRES_USER)"
PG_DB="$(env_value POSTGRES_DB)"
PG_USER="${PG_USER:-helpdesk}"
PG_DB="${PG_DB:-helpdesk}"

echo "[$(date +'%F %T')] iniciando backup do HelpDesk"

# Formato custom (-Fc): comprimido e restaurável seletivamente com pg_restore.
#
# Grava num .part e só renomeia no fim: o `>` cria o arquivo antes de o
# comando rodar, e uma falha deixaria um helpdesk_*.dump de 0 bytes com cara
# de backup válido. O trap limpa o .part em qualquer saída, inclusive por erro.
trap 'rm -f "${DUMP_FILE}.part"' EXIT
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" exec -T db \
  pg_dump -U "${PG_USER}" -d "${PG_DB}" -Fc > "${DUMP_FILE}.part"
mv "${DUMP_FILE}.part" "${DUMP_FILE}"

# Um dump truncado é pior que nenhum: falha ruidosamente antes de a rotação
# apagar os backups antigos e bons.
if [[ ! -s "${DUMP_FILE}" ]]; then
  echo "ERRO: dump vazio, abortando sem rotacionar." >&2
  rm -f "${DUMP_FILE}"
  exit 1
fi

# Anexos e fotos do inventário vivem em volume nomeado; copia via container
# para não depender do caminho interno do Docker no host.
#
# Confere antes que o volume existe: `docker run -v nome:...` com um nome
# inexistente CRIA um volume vazio e o backup sai vazio, sem erro nenhum.
if ! docker volume inspect "${UPLOADS_VOLUME}" > /dev/null 2>&1; then
  echo "ERRO: volume ${UPLOADS_VOLUME} não existe (veja: docker volume ls | grep uploads)." >&2
  exit 1
fi
docker run --rm \
  -v "${UPLOADS_VOLUME}:/uploads:ro" \
  -v "${BACKUP_DIR}:/backup" \
  alpine tar czf "/backup/$(basename "${UPLOADS_FILE}")" -C /uploads .

echo "  banco:   $(du -h "${DUMP_FILE}" | cut -f1)  ${DUMP_FILE}"
echo "  anexos:  $(du -h "${UPLOADS_FILE}" | cut -f1)  ${UPLOADS_FILE}"

# Rotação só depois de o backup do dia estar confirmado no disco.
find "${BACKUP_DIR}" -name 'helpdesk_*.dump' -mtime "+${RETENTION_DAYS}" -delete
find "${BACKUP_DIR}" -name 'uploads_*.tar.gz' -mtime "+${RETENTION_DAYS}" -delete

echo "[$(date +'%F %T')] backup concluído (retenção: ${RETENTION_DAYS} dias)"

# Restaurar:
#   docker compose -f docker-compose.v2.yml --env-file .env.v2 exec -T db \
#     pg_restore -U helpdesk -d helpdesk --clean --if-exists < helpdesk_AAAA-MM-DD_HHMM.dump
