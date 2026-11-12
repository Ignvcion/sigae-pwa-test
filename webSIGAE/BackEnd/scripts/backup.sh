#!/bin/bash
# RNF11: respaldo automático de la base de datos completa (mysqldump),
# con una frecuencia mínima de una vez cada 24 horas. SOLO DESARROLLO: en
# producción se usa scripts/enviarRespaldo.js, que además lo envía por correo
# a la cuenta de respaldos (docs/respaldos-por-correo.md).
#
# Uso manual:
#   ./scripts/backup.sh
#
# Uso programado (cron, una vez al día a las 03:00):
#   0 3 * * * /ruta/al/proyecto/webSIGAE/BackEnd/scripts/backup.sh >> /var/log/sigae-backup.log 2>&1
#
# Variables de entorno usadas (mismas que .env del backend):
#   DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
#   BACKUP_DIR   (opcional, por defecto ./backups)
#   BACKUP_KEEP_DAYS (opcional, por defecto 14 — respaldos más antiguos se eliminan)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_USER="${DB_USER:-sigae}"
DB_NAME="${DB_NAME:-sigae}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="$BACKUP_DIR/sigae_${TIMESTAMP}.sql.gz"

echo "=== Respaldando base de datos '$DB_NAME' en $OUT_FILE ==="
MYSQL_PWD="${DB_PASSWORD:-}" mysqldump \
  -h "$DB_HOST" \
  -u "$DB_USER" \
  --single-transaction \
  --routines \
  --triggers \
  "$DB_NAME" | gzip > "$OUT_FILE"

echo "=== Respaldo completado: $(du -h "$OUT_FILE" | cut -f1) ==="

echo "=== Eliminando respaldos con más de $BACKUP_KEEP_DAYS días ==="
find "$BACKUP_DIR" -name 'sigae_*.sql.gz' -mtime "+$BACKUP_KEEP_DAYS" -print -delete

echo "=== Listo ==="
