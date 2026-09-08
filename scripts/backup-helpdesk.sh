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
RETENTION_DAYS="${RETENTION_DAYS:-30}"

STAMP="$(date +%Y-%m-%d_%H%M)"
DUMP_FILE="${BACKUP_DIR}/helpdesk_${STAMP}.dump"
UPLOADS_FILE="${BACKUP_DIR}/uploads_${STAMP}.tar.gz"

mkdir -p "${BACKUP_DIR}"

# Carrega POSTGRES_USER / POSTGRES_DB do mesmo .env que o compose usa, para
# não haver duas fontes de verdade para as credenciais.
if [[ -f "${PROJECT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${PROJECT_DIR}/.env"
  set +a
fi

PG_USER="${POSTGRES_USER:-helpdesk}"
PG_DB="${POSTGRES_DB:-helpdesk}"

echo "[$(date +'%F %T')] iniciando backup do HelpDesk"

# Formato custom (-Fc): comprimido e restaurável seletivamente com pg_restore.
docker compose -f "${COMPOSE_FILE}" exec -T db \
  pg_dump -U "${PG_USER}" -d "${PG_DB}" -Fc > "${DUMP_FILE}"

# Um dump truncado é pior que nenhum: falha ruidosamente antes de a rotação
# apagar os backups antigos e bons.
if [[ ! -s "${DUMP_FILE}" ]]; then
  echo "ERRO: dump vazio, abortando sem rotacionar." >&2
  rm -f "${DUMP_FILE}"
  exit 1
fi

# Anexos vivem em volume nomeado; copia via container para não depender do
# caminho interno do Docker no host.
docker run --rm \
  -v helpdesk_uploads:/uploads:ro \
  -v "${BACKUP_DIR}:/backup" \
  alpine tar czf "/backup/$(basename "${UPLOADS_FILE}")" -C /uploads .

echo "  banco:   $(du -h "${DUMP_FILE}" | cut -f1)  ${DUMP_FILE}"
echo "  anexos:  $(du -h "${UPLOADS_FILE}" | cut -f1)  ${UPLOADS_FILE}"

# Rotação só depois de o backup do dia estar confirmado no disco.
find "${BACKUP_DIR}" -name 'helpdesk_*.dump' -mtime "+${RETENTION_DAYS}" -delete
find "${BACKUP_DIR}" -name 'uploads_*.tar.gz' -mtime "+${RETENTION_DAYS}" -delete

echo "[$(date +'%F %T')] backup concluído (retenção: ${RETENTION_DAYS} dias)"

# Restaurar:
#   docker compose -f docker-compose.v2.yml exec -T db \
#     pg_restore -U helpdesk -d helpdesk --clean --if-exists < helpdesk_AAAA-MM-DD_HHMM.dump
