#!/usr/bin/env bash
# deploy.sh — Deploy aman ke VPS dengan health check + auto-rollback.
#
# Jalankan dari laptop (Mac), dari dalam folder repo:
#   ./deploy/deploy.sh
#
# Alur:
#   1. Cek lokal: branch benar, tidak ada perubahan belum di-commit, sudah di-push.
#   2. SSH ke VPS lalu: backup -> amankan sesi WA -> ambil kode -> build -> swap -> health check.
#   3. Kalau backend baru tidak sehat, otomatis ROLLBACK ke versi sebelumnya (frontend tidak disentuh).
#
# Override lewat env, mis:  SKIP_GIT_CHECK=1 ./deploy/deploy.sh
set -euo pipefail

# ---------- Konfigurasi (boleh di-override via env) ----------
SSH_HOST=${SSH_HOST:-mastery@103.181.143.107}
APP_DIR=${APP_DIR:-/var/www/wa-assistant}
SERVICE=${SERVICE:-wai}
BRANCH=${BRANCH:-main}                                   # branch sumber di GitHub
HEALTH_URL=${HEALTH_URL:-http://127.0.0.1:3031/api/plans} # endpoint cek "backend hidup"
HEALTH_RETRIES=${HEALTH_RETRIES:-30}                     # coba health check sekian kali (1 detik sekali)
SKIP_GIT_CHECK=${SKIP_GIT_CHECK:-0}                      # 1 = lewati cek "sudah di-push" (tidak disarankan)

say() { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }
ok()  { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ---------- 1. Preflight lokal: pastikan kode sudah masuk GitHub ----------
say "Preflight lokal"
ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || die "Bukan di dalam git repo"
cd "$ROOT"
CUR_BRANCH=$(git rev-parse --abbrev-ref HEAD)
[ "$CUR_BRANCH" = "$BRANCH" ] || die "Kamu di branch '$CUR_BRANCH', deploy butuh '$BRANCH'. Pindah branch dulu."
if [ "$SKIP_GIT_CHECK" != "1" ]; then
  [ -z "$(git status --porcelain)" ] || die "Ada perubahan belum di-commit. Commit/stash dulu (atau SKIP_GIT_CHECK=1)."
  git fetch -q origin "$BRANCH" || die "git fetch gagal — cek koneksi/akses GitHub"
  LOCAL=$(git rev-parse "$BRANCH"); REMOTE=$(git rev-parse "origin/$BRANCH")
  [ "$LOCAL" = "$REMOTE" ] || die "origin/$BRANCH belum sama dengan lokal. 'git push' dulu."
fi
DEPLOY_SHA=$(git rev-parse --short HEAD)
ok "Lokal bersih & sudah ter-push. Akan deploy commit $DEPLOY_SHA"

# ---------- 2. Jalankan urutan deploy di VPS ----------
say "Deploy ke $SSH_HOST ($APP_DIR)"
ssh -o BatchMode=yes -o ConnectTimeout=20 "$SSH_HOST" \
  "APP_DIR='$APP_DIR' SERVICE='$SERVICE' BRANCH='$BRANCH' HEALTH_URL='$HEALTH_URL' HEALTH_RETRIES='$HEALTH_RETRIES' EXPECT_SHA='$DEPLOY_SHA' bash -s" <<'REMOTE'
set -uo pipefail
step(){ printf '\033[1;34m-> %s\033[0m\n' "$*"; }
ok(){   printf '\033[1;32m  ✓ %s\033[0m\n' "$*"; }
die(){  printf '\033[1;31m  ✗ %s\033[0m\n' "$*" >&2; exit 1; }

cd "$APP_DIR" || die "APP_DIR tidak ada: $APP_DIR"

# -- 2.1 Backup dulu (DB + sesi WhatsApp) sebelum apa pun diubah --
step "Backup database & sesi WhatsApp"
if [ -f deploy/backup.sh ]; then
  bash deploy/backup.sh || die "backup gagal — deploy dibatalkan"
else
  echo "  (deploy/backup.sh tidak ada, backup dilewati)"
fi

# -- 2.2 Amankan file runtime supaya 'git reset' tidak menimpa/menghapus sesi WA --
step "Amankan file runtime (sesi WhatsApp)"
cp -p wa-assistant.db wa-assistant.db.predeploy 2>/dev/null || true
git rm -r --cached --quiet --ignore-unmatch \
  wa-assistant.db wa-assistant.db-shm wa-assistant.db-wal data wa-assistant >/dev/null 2>&1 || true

# -- 2.3 Ambil kode terbaru dari GitHub (deterministik, tanpa konflik merge) --
step "Ambil kode dari origin/$BRANCH"
git fetch --prune origin "$BRANCH" || die "git fetch gagal"
git reset --hard "origin/$BRANCH" || die "git reset gagal"
GOT_SHA=$(git rev-parse --short HEAD)
if [ -n "$EXPECT_SHA" ] && [ "$GOT_SHA" != "$EXPECT_SHA" ]; then
  echo "  (catatan: commit server $GOT_SHA berbeda dari harapan $EXPECT_SHA)"
fi
ok "Kode sekarang di commit $GOT_SHA"

# -- 2.4 Pastikan sesi WhatsApp selamat setelah reset --
if [ ! -s wa-assistant.db ] && [ -s wa-assistant.db.predeploy ]; then
  echo "  ! wa-assistant.db hilang setelah reset — memulihkan dari backup pra-deploy"
  mv wa-assistant.db.predeploy wa-assistant.db || die "gagal memulihkan wa-assistant.db"
  die "Sesi WA sempat hilang (sudah dipulihkan). Deploy dibatalkan demi keamanan."
fi
ok "Sesi WhatsApp aman"

# -- 2.5 Build backend ke wa-server.new (kalau gagal, produksi belum tersentuh) --
step "Build backend (Go)"
( cd backend && go build -o ../wa-server.new . ) || die "go build gagal — produksi tidak diubah"
[ -x wa-server.new ] || die "wa-server.new tidak terbentuk"
ok "Backend ter-build -> wa-server.new"

# -- 2.6 Build frontend ke dist.new (di-swap atomik nanti) --
step "Build frontend (Vite)"
( cd frontend && npm ci --no-audit --no-fund && npm run build -- --outDir dist.new --emptyOutDir ) \
  || { rm -rf frontend/dist.new wa-server.new; die "build frontend gagal — produksi tidak diubah"; }
[ -f frontend/dist.new/index.html ] || { rm -rf frontend/dist.new wa-server.new; die "dist.new kosong"; }
ok "Frontend ter-build -> dist.new"

# -- 2.7 Pasang backend baru + restart service --
step "Pasang backend baru & restart $SERVICE"
cp -p wa-server wa-server.bak 2>/dev/null || true   # simpan versi lama untuk rollback
mv wa-server.new wa-server
sudo systemctl restart "$SERVICE" || die "restart $SERVICE gagal"

# -- 2.8 Health check; ROLLBACK otomatis kalau backend tidak sehat --
step "Health check ($HEALTH_URL)"
healthy=0; i=0
while [ "$i" -lt "$HEALTH_RETRIES" ]; do
  if curl -fsS -o /dev/null --max-time 5 "$HEALTH_URL"; then healthy=1; break; fi
  i=$((i+1)); sleep 1
done
if [ "$healthy" != "1" ]; then
  echo "  ! Health check GAGAL — rollback backend ke versi sebelumnya"
  if [ -f wa-server.bak ]; then
    mv wa-server wa-server.failed
    mv wa-server.bak wa-server
    sudo systemctl restart "$SERVICE"
    sleep 3
    if curl -fsS -o /dev/null --max-time 5 "$HEALTH_URL"; then
      echo "  rollback OK — produksi kembali normal (versi lama)"
    else
      echo "  ! ROLLBACK JUGA GAGAL — butuh pengecekan manual segera!"
    fi
  else
    echo "  ! tidak ada wa-server.bak untuk rollback!"
  fi
  rm -rf frontend/dist.new
  die "Deploy dibatalkan. Backend di-rollback, frontend tidak diubah."
fi
ok "Backend sehat"

# -- 2.9 Backend sehat -> swap frontend (atomik) --
step "Pasang frontend baru"
rm -rf frontend/dist.bak
[ -d frontend/dist ] && mv frontend/dist frontend/dist.bak
mv frontend/dist.new frontend/dist
ok "Frontend terpasang"

# -- 2.10 Bersih-bersih file sementara --
rm -f wa-assistant.db.predeploy wa-server.failed 2>/dev/null || true
ok "Deploy commit $GOT_SHA sukses & sehat"
REMOTE

ok "DEPLOY SUKSES → commit $DEPLOY_SHA live di VPS"
echo "  Cek situs   : https://chatloop.id"
echo "  Rollback man: ssh $SSH_HOST 'cd $APP_DIR && mv wa-server.bak wa-server && sudo systemctl restart $SERVICE'"
