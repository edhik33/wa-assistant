#!/usr/bin/env bash
# Backup harian: dump MySQL + arsip sesi WhatsApp (SQLite). Dipasang via systemd timer di server.
# Lihat deploy/README untuk cara pasang. Restore:
#   DB:   zcat db-XXXX.sql.gz | MYSQL_PWD=<pass> mysql -u <user> <dbname>
#   Sesi: tar -xzf wa-session-XXXX.tar.gz -C /var/www/Wai && sudo systemctl restart wai
set -uo pipefail
APP_DIR=/var/www/wa-assistant
BACKUP_DIR=/home/mastery/wai-backups
KEEP=14
mkdir -p "$BACKUP_DIR"
cd "$APP_DIR"

DB_HOST=$(grep -E '^DB_HOST=' .env | cut -d= -f2- || true)
DB_PORT=$(grep -E '^DB_PORT=' .env | cut -d= -f2- || true)
DB_USER=$(grep -E '^DB_USER=' .env | cut -d= -f2- || true)
DB_PASS=$(grep -E '^DB_PASS=' .env | cut -d= -f2- || true)
DB_NAME=$(grep -E '^DB_NAME=' .env | cut -d= -f2- || true)
STAMP=$(date +%Y%m%d-%H%M%S)

# MySQL dump (MYSQL_PWD agar password tidak muncul di daftar proses)
MYSQL_PWD="$DB_PASS" mysqldump --single-transaction --no-tablespaces \
  -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" "$DB_NAME" | gzip > "$BACKUP_DIR/db-$STAMP.sql.gz"

# Sesi WhatsApp (file SQLite whatsmeow + WAL + folder data)
tar -czf "$BACKUP_DIR/wa-session-$STAMP.tar.gz" --ignore-failed-read \
  -C "$APP_DIR" wa-assistant.db wa-assistant.db-wal wa-assistant.db-shm data 2>/dev/null || true

# Rotasi: simpan KEEP backup terbaru
ls -1t "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null | tail -n +$((KEEP+1)) | xargs -r rm -f
ls -1t "$BACKUP_DIR"/wa-session-*.tar.gz 2>/dev/null | tail -n +$((KEEP+1)) | xargs -r rm -f

echo "Backup OK: $STAMP -> $BACKUP_DIR"

# --- Off-site ke Google Drive (rclone) ---
# Lindungi dari "VPS mati total": salin backup ke luar server.
# Aman dilewati kalau remote rclone belum dikonfigurasi (token belum dipasang),
# dan kegagalan upload TIDAK menggagalkan backup lokal.
export RCLONE_CONFIG="${RCLONE_CONFIG:-/home/mastery/.config/rclone/rclone.conf}"
RCLONE_REMOTE=${RCLONE_REMOTE:-gdrive}
OFFSITE_PATH=${OFFSITE_PATH:-wai-backups}
OFFSITE_KEEP_DAYS=${OFFSITE_KEEP_DAYS:-30}
if command -v rclone >/dev/null 2>&1 && rclone listremotes 2>/dev/null | grep -q "^${RCLONE_REMOTE}:"; then
  if rclone copy "$BACKUP_DIR" "${RCLONE_REMOTE}:${OFFSITE_PATH}" --transfers 2 --checkers 4; then
    rclone delete "${RCLONE_REMOTE}:${OFFSITE_PATH}" --min-age "${OFFSITE_KEEP_DAYS}d" 2>/dev/null || true
    echo "Off-site OK: -> ${RCLONE_REMOTE}:${OFFSITE_PATH} (simpan ${OFFSITE_KEEP_DAYS} hari terakhir)"
  else
    echo "Off-site GAGAL upload (backup lokal tetap aman)"
  fi
else
  echo "Off-site dilewati: remote rclone '${RCLONE_REMOTE}' belum dikonfigurasi"
fi
