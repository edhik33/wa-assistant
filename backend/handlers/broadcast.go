package handlers

import (
	"encoding/json"
	"io"
	"log"
	"math/rand"
	"os"
	"runtime/debug"
	"strconv"
	"strings"
	"time"

	"wa-assistant/backend/database"
	"wa-assistant/backend/models"
	"wa-assistant/backend/services"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// minBroadcastDelay = jeda minimum antar pesan (detik) yang dipaksakan demi keamanan nomor,
// berapa pun yang dikirim pengguna.
const minBroadcastDelay = 8

type broadcastSendErrorAction string

const (
	broadcastErrorFailed       broadcastSendErrorAction = "failed"
	broadcastErrorInterrupted  broadcastSendErrorAction = "interrupted"
	broadcastErrorWARestricted broadcastSendErrorAction = "wa_restricted"
)

func classifyBroadcastSendError(err error) (broadcastSendErrorAction, int) {
	if code, ok := services.WAServerErrorCode(err); ok && code == 463 {
		return broadcastErrorWARestricted, code
	}
	if err != nil && strings.Contains(err.Error(), "tidak terhubung") {
		return broadcastErrorInterrupted, 0
	}
	return broadcastErrorFailed, 0
}

// CreateBroadcast membuat kampanye broadcast (multipart: bisa dengan lampiran) & menjalankannya di background.
func CreateBroadcast(c *gin.Context) {
	id, ok := resolveAgent(c)
	if !ok {
		return
	}
	tid := currentTenantID(c)

	message := c.PostForm("message")
	if strings.TrimSpace(message) == "" {
		c.JSON(400, gin.H{"error": "Pesan wajib diisi"})
		return
	}
	var reqRecipients []broadcastGuardRecipient
	if err := json.Unmarshal([]byte(c.PostForm("recipients")), &reqRecipients); err != nil || len(reqRecipients) == 0 {
		c.JSON(400, gin.H{"error": "Penerima wajib diisi"})
		return
	}
	if !services.WA(id).IsConnected() {
		c.JSON(400, gin.H{"error": "WhatsApp belum tersambung"})
		return
	}
	var paused int64
	database.DB.Model(&models.Broadcast{}).
		Where("agent_id = ? AND status = ?", id, models.BroadcastWARestricted).Count(&paused)
	if paused > 0 {
		c.JSON(409, gin.H{"error": "Ada broadcast yang dijeda oleh WhatsApp. Lanjutkan atau batalkan broadcast tersebut terlebih dahulu."})
		return
	}
	if len(reqRecipients) > 1000 {
		c.JSON(400, gin.H{"error": "Maksimal 1000 penerima per broadcast"})
		return
	}
	// Tolak lebih awal kalau kuota broadcast bulanan paket sudah habis (UX lebih jelas
	// daripada semua penerima ter-skip saat pengiriman).
	if broadcastQuotaRemaining(tid) == 0 {
		c.JSON(403, gin.H{"error": "Kuota broadcast bulanan paket kamu sudah habis. Upgrade paket atau tunggu bulan depan."})
		return
	}

	minD, _ := strconv.Atoi(c.PostForm("min_delay"))
	maxD, _ := strconv.Atoi(c.PostForm("max_delay"))
	minD, maxD = normalizeBroadcastDelay(minD, maxD)
	restEvery, _ := strconv.Atoi(c.PostForm("rest_every"))
	restDuration, _ := strconv.Atoi(c.PostForm("rest_duration"))
	restEvery, restDuration = normalizeBroadcastRest(restEvery, restDuration)

	b := models.Broadcast{}

	guardRecipients := normalizeGuardRecipients(reqRecipients)
	if len(guardRecipients) == 0 {
		c.JSON(400, gin.H{"error": "Tidak ada nomor valid"})
		return
	}

	// Broadcast murni: kirim langsung ke daftar tanpa pengecekan nomor ke WhatsApp
	// maupun gating consent/risiko. Pengaman tetap berjalan di worker runBroadcast:
	// opt-out (STOP) dilewati, kuota bulanan & jeda/istirahat dihormati.
	b.TenantID = tid
	b.AgentID = id
	b.Message = message
	b.Status = "pending"
	b.Total = len(guardRecipients)
	b.MinDelay = minD
	b.MaxDelay = maxD
	b.RestEvery = restEvery
	b.RestDuration = restDuration

	// Simpan lampiran kalau ada.
	if fh, err := c.FormFile("file"); err == nil {
		if f, ferr := fh.Open(); ferr == nil {
			defer f.Close()
			data, _ := io.ReadAll(f)
			b.Mimetype = fh.Header.Get("Content-Type")
			if b.Mimetype == "" {
				b.Mimetype = "application/octet-stream"
			}
			b.FileName = fh.Filename
			b.MediaType = "document"
			if strings.HasPrefix(b.Mimetype, "image/") {
				b.MediaType = "image"
			} else if strings.HasPrefix(b.Mimetype, "video/") {
				b.MediaType = "video"
			}
			b.MediaPath = storeMedia(id, data, b.Mimetype, fh.Filename)
		}
	}

	recipients := make([]models.BroadcastRecipient, 0, len(guardRecipients))
	for _, r := range guardRecipients {
		recipients = append(recipients, models.BroadcastRecipient{Number: r.Number, Name: r.Name, Status: "pending"})
	}

	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&b).Error; err != nil {
			return err
		}
		for i := range recipients {
			recipients[i].BroadcastID = b.ID
		}
		return tx.Create(&recipients).Error
	}); err != nil {
		log.Printf("Gagal Create Broadcast: %v", err)
		c.JSON(500, gin.H{"error": "Broadcast belum bisa dibuat"})
		return
	}

	go runBroadcast(b.ID, id, minD, maxD)
	c.JSON(200, gin.H{"data": b})
}

// CancelBroadcast membatalkan broadcast yang belum selesai.
// Dua tahap: running -> cancel_requested -> (worker cek) -> cancelled.
// Pending/interrupted langsung finalize karena tidak ada worker aktif.
func CancelBroadcast(c *gin.Context) {
	id, ok := resolveAgent(c)
	if !ok {
		return
	}
	bid, err := strconv.Atoi(c.Param("bid"))
	if err != nil || bid <= 0 {
		c.JSON(400, gin.H{"error": "ID broadcast tidak valid"})
		return
	}
	var b models.Broadcast
	if database.DB.Where("id = ? AND agent_id = ?", bid, id).First(&b).Error != nil {
		c.JSON(404, gin.H{"error": "Broadcast tidak ditemukan"})
		return
	}
	switch b.Status {
	case "done", "failed", models.BroadcastCancelled:
		c.JSON(400, gin.H{"error": "Broadcast sudah selesai dan tidak bisa dibatalkan"})
		return
	}
	// Kalau tidak ada worker aktif, finalize langsung.
	if b.Status == models.BroadcastPending || b.Status == models.BroadcastInterrupted || b.Status == models.BroadcastWARestricted {
		finalizeCancelledBroadcast(b.ID)
		c.JSON(200, gin.H{"message": "Broadcast dibatalkan", "status": models.BroadcastCancelled})
		return
	}
	// Kalau running, minta worker berhenti di checkpoint.
	res := database.DB.Model(&models.Broadcast{}).
		Where("id = ? AND agent_id = ? AND status IN ?", b.ID, id, []string{models.BroadcastRunning, models.BroadcastResuming}).
		Update("status", models.BroadcastCancelRequested)
	if res.Error != nil {
		c.JSON(500, gin.H{"error": "Gagal membatalkan broadcast"})
		return
	}
	if res.RowsAffected == 0 {
		c.JSON(409, gin.H{"error": "Broadcast sudah berubah status. Silakan refresh."})
		return
	}
	c.JSON(200, gin.H{
		"message": "Permintaan cancel diterima. Broadcast akan berhenti setelah proses saat ini selesai.",
		"status":  models.BroadcastCancelRequested,
	})
}

// ResumeBroadcast melanjutkan broadcast yang dijeda WhatsApp. Transisi atomik mencegah
// dua klik menjalankan dua worker. Worker mencoba penerima pending pertama; jika berhasil,
// antrean berikutnya otomatis diteruskan, jika 463 muncul lagi broadcast kembali dijeda.
func ResumeBroadcast(c *gin.Context) {
	id, ok := resolveAgent(c)
	if !ok {
		return
	}
	bid, err := strconv.Atoi(c.Param("bid"))
	if err != nil || bid <= 0 {
		c.JSON(400, gin.H{"error": "ID broadcast tidak valid"})
		return
	}
	if !services.WA(id).IsConnected() {
		c.JSON(409, gin.H{"error": "WhatsApp belum tersambung"})
		return
	}
	var b models.Broadcast
	if database.DB.Where("id = ? AND agent_id = ?", bid, id).First(&b).Error != nil {
		c.JSON(404, gin.H{"error": "Broadcast tidak ditemukan"})
		return
	}
	if b.Status != models.BroadcastWARestricted {
		c.JSON(409, gin.H{"error": "Broadcast ini tidak sedang dijeda oleh WhatsApp"})
		return
	}
	var pending int64
	database.DB.Model(&models.BroadcastRecipient{}).
		Where("broadcast_id = ? AND status = ?", b.ID, "pending").Count(&pending)
	if pending == 0 {
		c.JSON(409, gin.H{"error": "Tidak ada penerima yang menunggu"})
		return
	}
	res := database.DB.Model(&models.Broadcast{}).
		Where("id = ? AND agent_id = ? AND status = ?", b.ID, id, models.BroadcastWARestricted).
		Updates(map[string]any{
			"status": models.BroadcastResuming, "pause_reason": "", "pause_code": 0, "paused_at": nil,
		})
	if res.Error != nil {
		c.JSON(500, gin.H{"error": "Broadcast belum bisa dilanjutkan"})
		return
	}
	if res.RowsAffected == 0 {
		c.JSON(409, gin.H{"error": "Broadcast sedang diproses. Silakan refresh."})
		return
	}
	_ = database.DB.Model(&models.ScheduledMessage{}).Where("broadcast_id = ?", b.ID).
		Update("status", models.BroadcastResuming).Error
	minD, maxD := normalizeBroadcastDelay(b.MinDelay, b.MaxDelay)
	go runBroadcast(b.ID, id, minD, maxD)
	c.JSON(200, gin.H{
		"message": "Mencoba melanjutkan broadcast", "status": models.BroadcastResuming, "pending": pending,
	})
}

// isBroadcastCancelRequested cek apakah broadcast sudah diminta cancel.
func isBroadcastCancelRequested(broadcastID uint) bool {
	var status string
	if err := database.DB.Model(&models.Broadcast{}).
		Where("id = ?", broadcastID).Select("status").Scan(&status).Error; err != nil {
		log.Printf("Gagal cek status cancel broadcast %d: %v", broadcastID, err)
		return false
	}
	return status == models.BroadcastCancelRequested || status == models.BroadcastCancelled
}

// finalizeCancelledBroadcast menandai recipient pending sebagai skipped,
// lalu set status broadcast final jadi cancelled.
func finalizeCancelledBroadcast(broadcastID uint) {
	database.DB.Model(&models.BroadcastRecipient{}).
		Where("broadcast_id = ? AND status = ?", broadcastID, "pending").
		Updates(map[string]any{"status": "skipped", "error": "broadcast dibatalkan user"})
	var sent, failed, skipped int64
	database.DB.Model(&models.BroadcastRecipient{}).Where("broadcast_id = ? AND status = ?", broadcastID, "sent").Count(&sent)
	database.DB.Model(&models.BroadcastRecipient{}).Where("broadcast_id = ? AND status = ?", broadcastID, "failed").Count(&failed)
	database.DB.Model(&models.BroadcastRecipient{}).Where("broadcast_id = ? AND status = ?", broadcastID, "skipped").Count(&skipped)
	finishBroadcast(broadcastID, models.BroadcastCancelled, int(sent), int(failed), int(skipped))
}

// sleepBroadcastDelay tidur 1 detik per iterasi sambil cek cancel.
// Return false jika broadcast sudah diminta cancel.
func sleepBroadcastDelay(broadcastID uint, d int) bool {
	for i := 0; i < d; i++ {
		if isBroadcastCancelRequested(broadcastID) {
			return false
		}
		time.Sleep(1 * time.Second)
	}
	return true
}

// ResumeBroadcasts melanjutkan broadcast yang masih punya penerima "pending"
// (mis. server sempat restart di tengah pengiriman). Dipanggil sekali saat startup.
func ResumeBroadcasts() {
	// Bereskan cancel_requested yang nyangkut (server mati setelah user klik cancel).
	var cancelReq []models.Broadcast
	database.DB.Where("status = ?", models.BroadcastCancelRequested).Find(&cancelReq)
	for _, b := range cancelReq {
		finalizeCancelledBroadcast(b.ID)
	}

	var bs []models.Broadcast
	database.DB.Where("status IN ?", []string{models.BroadcastRunning, models.BroadcastInterrupted, models.BroadcastPending, models.BroadcastResuming}).Find(&bs)
	for _, b := range bs {
		var pending int64
		database.DB.Model(&models.BroadcastRecipient{}).Where("broadcast_id = ? AND status = ?", b.ID, "pending").Count(&pending)
		if pending == 0 {
			_ = database.DB.Model(&models.Broadcast{}).Where("id = ?", b.ID).Update("status", "done").Error
			continue
		}
		res := database.DB.Model(&models.Broadcast{}).
			Where("id = ? AND status IN ?", b.ID, []string{models.BroadcastRunning, models.BroadcastInterrupted, models.BroadcastPending, models.BroadcastResuming}).
			Update("status", models.BroadcastResuming)
		if res.Error != nil || res.RowsAffected == 0 {
			continue
		}
		go resumeBroadcast(b.ID, b.AgentID)
	}
}

// resumeBroadcast menunggu WA agent tersambung (maks ~90 detik) lalu melanjutkan pengiriman.
func resumeBroadcast(broadcastID, agentID uint) {
	defer services.RecoverGo("resumeBroadcast")
	for i := 0; i < 18; i++ {
		if isBroadcastCancelRequested(broadcastID) {
			finalizeCancelledBroadcast(broadcastID)
			return
		}
		if services.WA(agentID).IsConnected() {
			minD, maxD := resumeBroadcastDelay(broadcastID)
			log.Printf("Melanjutkan broadcast %d (agent %d), jeda %d-%d dtk", broadcastID, agentID, minD, maxD)
			runBroadcast(broadcastID, agentID, minD, maxD)
			return
		}
		time.Sleep(5 * time.Second)
	}
	_ = database.DB.Model(&models.Broadcast{}).
		Where("id = ? AND status = ?", broadcastID, models.BroadcastResuming).
		Update("status", models.BroadcastInterrupted).Error
	log.Printf("Broadcast %d belum dilanjutkan: WA agent %d tidak tersambung", broadcastID, agentID)
}

// safeRun menjalankan fn secara sinkron dengan pemulihan panic supaya satu
// kegagalan di sebuah goroutine tidak menjatuhkan seluruh proses (multi-tenant).
// Alias lokal ke services.Safe agar call-site di package ini tetap ringkas.
func safeRun(name string, fn func()) {
	services.Safe(name, fn)
}

// runBroadcast mengirim pesan satu per satu dengan jeda ritme yang dipilih pengguna.
func runBroadcast(broadcastID, agentID uint, minD, maxD int) {
	// Pulihkan panic agar broadcast bermasalah tidak menjatuhkan seluruh proses.
	// Status dikembalikan ke "interrupted" supaya sisa penerima bisa dilanjutkan.
	defer func() {
		if r := recover(); r != nil {
			log.Printf("Broadcast %d PANIC dipulihkan: %v — ditandai interrupted agar bisa dilanjutkan\n%s", broadcastID, r, debug.Stack())
			_ = database.DB.Model(&models.Broadcast{}).
				Where("id = ? AND status = ?", broadcastID, models.BroadcastRunning).
				Update("status", models.BroadcastInterrupted).Error
		}
	}()
	claim := database.DB.Model(&models.Broadcast{}).
		Where("id = ? AND status IN ?", broadcastID, []string{models.BroadcastPending, models.BroadcastResuming}).
		Updates(map[string]any{"status": models.BroadcastRunning, "pause_reason": "", "pause_code": 0, "paused_at": nil})
	if claim.Error != nil {
		log.Printf("Broadcast %d gagal mengambil antrean: %v", broadcastID, claim.Error)
		return
	}
	if claim.RowsAffected == 0 {
		if isBroadcastCancelRequested(broadcastID) {
			finalizeCancelledBroadcast(broadcastID)
		}
		return
	}
	_ = database.DB.Model(&models.ScheduledMessage{}).Where("broadcast_id = ?", broadcastID).
		Update("status", models.BroadcastRunning).Error

	var b models.Broadcast
	database.DB.First(&b, broadcastID)
	var recipients []models.BroadcastRecipient
	database.DB.Where("broadcast_id = ? AND status = ?", broadcastID, "pending").Order("id asc").Find(&recipients)

	// Baca lampiran sekali saja (kalau ada), dipakai untuk semua penerima.
	var mediaBytes []byte
	if b.MediaType != "" && b.MediaPath != "" {
		mediaBytes, _ = os.ReadFile(b.MediaPath)
	}
	// Upload media SEKALI di awal lalu dipakai ulang untuk semua penerima (hemat waktu & kuota,
	// terutama video). Kalau upload awal gagal, biarkan nil -> nanti fallback upload per penerima.
	var prepared *services.PreparedMedia
	if len(mediaBytes) > 0 {
		if pm, err := services.WA(agentID).PrepareMedia(b.MediaType, b.Mimetype, b.FileName, mediaBytes); err != nil {
			log.Printf("Broadcast %d: upload media sekali gagal (%v), fallback upload per penerima", broadcastID, err)
		} else {
			prepared = pm
		}
	}

	restEvery, restDuration := normalizeBroadcastRest(b.RestEvery, b.RestDuration)
	sentSinceRest := 0
	var sentCount, failedCount, skippedCount int64
	database.DB.Model(&models.BroadcastRecipient{}).Where("broadcast_id = ? AND status = ?", broadcastID, "sent").Count(&sentCount)
	database.DB.Model(&models.BroadcastRecipient{}).Where("broadcast_id = ? AND status = ?", broadcastID, "failed").Count(&failedCount)
	database.DB.Model(&models.BroadcastRecipient{}).Where("broadcast_id = ? AND status = ?", broadcastID, "skipped").Count(&skippedCount)
	sent, failed, skipped := int(sentCount), int(failedCount), int(skippedCount)

	// Muat sekali di awal (bukan query per-penerima): himpunan opt-out + jumlah terkirim hari ini.
	recipientNumbers := make([]string, 0, len(recipients))
	for _, recipient := range recipients {
		recipientNumbers = append(recipientNumbers, recipient.Number)
	}
	optedOut := optedOutSet(agentID)
	consented := activeConsentSet(agentID, b.ConsentCategory, recipientNumbers)
	// Kuota broadcast bulanan dari paket (0 = tanpa batas).
	bcLimit := broadcastMonthlyLimit(b.TenantID)
	bcUsed := broadcastMonthlyUsed(b.TenantID)

	for i, r := range recipients {
		// Cek cancel_requested di awal setiap iterasi.
		if isBroadcastCancelRequested(broadcastID) {
			finalizeCancelledBroadcast(broadcastID)
			log.Printf("Broadcast %d dibatalkan user sebelum kirim recipient berikutnya", broadcastID)
			return
		}
		// Pastikan WA tersambung; tunggu reconnect otomatis hingga ~60 detik. Kalau tetap putus,
		// JEDA broadcast (status interrupted) — sisa penerima tetap "pending" agar bisa dilanjutkan,
		// bukan ditandai gagal massal yang menyesatkan.
		if !waitConnected(agentID, 60*time.Second) {
			finishBroadcast(broadcastID, "interrupted", sent, failed, skipped)
			log.Printf("Broadcast %d dijeda: WA agent %d terputus (%d terkirim, sisa tetap pending)", broadcastID, agentID, sent)
			return
		}
		// Segarkan daftar opt-out berkala agar pelanggan yang baru kirim STOP di tengah jalan tetap dihormati.
		if i > 0 && i%25 == 0 {
			optedOut = optedOutSet(agentID)
			consented = activeConsentSet(agentID, b.ConsentCategory, recipientNumbers)
		}
		// Lewati yang sudah opt-out.
		if optedOut[r.Number] {
			markRecipient(r.ID, "skipped", "opt-out")
			skipped++
			updateBroadcastCounters(broadcastID, sent, failed, skipped)
			continue
		}
		// Broadcast baru wajib tetap punya consent aktif saat benar-benar dikirim.
		// Kategori kosong hanya terjadi pada data legacy sebelum guard consent tersedia.
		if b.ConsentCategory != "" && !consented[r.Number] {
			markRecipient(r.ID, "skipped", "consent sudah tidak aktif")
			skipped++
			updateBroadcastCounters(broadcastID, sent, failed, skipped)
			continue
		}
		// Hormati kuota broadcast bulanan dari paket langganan.
		if bcLimit > 0 && bcUsed >= bcLimit {
			markRecipient(r.ID, "skipped", "kuota broadcast bulanan habis")
			skipped++
			updateBroadcastCounters(broadcastID, sent, failed, skipped)
			continue
		}

		msg := personalize(b.Message, r.Name)
		// Cek cancel_requested sebelum kirim.
		if isBroadcastCancelRequested(broadcastID) {
			finalizeCancelledBroadcast(broadcastID)
			log.Printf("Broadcast %d dibatalkan user sebelum pengiriman ke %s", broadcastID, r.Number)
			return
		}
		var sendErr error
		switch {
		case prepared != nil:
			// Jalur cepat: media sudah di-upload sekali, tinggal kirim ke penerima ini.
			sendErr = services.WA(agentID).SendPreparedMedia(r.Number, msg, prepared)
		case b.MediaType == "image" && len(mediaBytes) > 0:
			sendErr = services.WA(agentID).SendImage(r.Number, msg, b.Mimetype, mediaBytes)
		case b.MediaType == "video" && len(mediaBytes) > 0:
			sendErr = services.WA(agentID).SendVideo(r.Number, msg, b.Mimetype, mediaBytes)
		case b.MediaType == "document" && len(mediaBytes) > 0:
			sendErr = services.WA(agentID).SendDocument(r.Number, b.FileName, b.Mimetype, msg, mediaBytes)
		default:
			sendErr = services.WA(agentID).SendText(r.Number, msg)
		}
		if sendErr != nil {
			action, code := classifyBroadcastSendError(sendErr)
			if action == broadcastErrorWARestricted {
				markRecipient(r.ID, "pending", "Pengiriman dijeda oleh WhatsApp")
				pauseBroadcastByWhatsApp(broadcastID, code, sent, failed, skipped)
				log.Printf("Broadcast %d dijeda: WhatsApp menolak pengiriman (kode %d), %d penerima masih menunggu", broadcastID, code, len(recipients)-i)
				return
			}
			// Error karena koneksi putus saat kirim -> jeda broadcast, JANGAN tandai gagal
			// (penerima tetap pending agar bisa dilanjutkan saat WA tersambung lagi).
			if action == broadcastErrorInterrupted {
				finishBroadcast(broadcastID, "interrupted", sent, failed, skipped)
				log.Printf("Broadcast %d dijeda saat kirim ke %s: WA terputus", broadcastID, r.Number)
				return
			}
			markRecipient(r.ID, "failed", sendErr.Error())
			failed++
		} else {
			now := time.Now()
			database.DB.Model(&models.BroadcastRecipient{}).Where("id = ?", r.ID).
				Updates(map[string]any{"status": "sent", "sent_at": &now, "error": ""})
			sent++
			bcUsed++ // hitung menuju kuota broadcast bulanan
			incrementBroadcastUsage(b.TenantID, 1)
			sentSinceRest++ // hitung menuju istirahat berkala
		}
		updateBroadcastCounters(broadcastID, sent, failed, skipped)

		// Jeda acak antar pesan (kecuali penerima terakhir), sambil cek cancel.
		if i < len(recipients)-1 {
			d := minD
			if maxD > minD {
				d = minD + rand.Intn(maxD-minD+1)
			}
			if !sleepBroadcastDelay(broadcastID, d) {
				finalizeCancelledBroadcast(broadcastID)
				log.Printf("Broadcast %d dibatalkan user saat jeda antar pesan", broadcastID)
				return
			}
			// Istirahat panjang berkala agar ritme tidak metronomik (mirip perilaku manusia).
			if restEvery > 0 && sentSinceRest >= restEvery {
				log.Printf("Broadcast %d istirahat %d dtk setelah %d pesan terkirim", broadcastID, restDuration, sentSinceRest)
				sentSinceRest = 0
				if !sleepBroadcastDelay(broadcastID, restDuration) {
					finalizeCancelledBroadcast(broadcastID)
					log.Printf("Broadcast %d dibatalkan user saat istirahat berkala", broadcastID)
					return
				}
			}
		}
	}

	// Status akhir jujur: kalau tidak ada satu pun terkirim & ada yang gagal, ini "failed", bukan "done".
	finalStatus := "done"
	if sent == 0 && failed > 0 {
		finalStatus = "failed"
	}
	finishBroadcast(broadcastID, finalStatus, sent, failed, skipped)
	log.Printf("Broadcast %d %s: %d terkirim, %d gagal, %d dilewati", broadcastID, finalStatus, sent, failed, skipped)
}

func pauseBroadcastByWhatsApp(broadcastID uint, code, sent, failed, skipped int) {
	now := time.Now()
	database.DB.Model(&models.Broadcast{}).Where("id = ?", broadcastID).Updates(map[string]any{
		"status": models.BroadcastWARestricted, "pause_reason": "wa_restriction", "pause_code": code,
		"paused_at": &now, "sent": sent, "failed": failed, "skipped": skipped,
	})
	_ = database.DB.Model(&models.ScheduledMessage{}).Where("broadcast_id = ?", broadcastID).
		Update("status", models.BroadcastWARestricted).Error
}

// finishBroadcast menyetel status akhir broadcast sekaligus menyinkronkan jadwal pemicunya
// (kalau broadcast ini berasal dari scheduled message) agar status di kalender tidak menipu.
func finishBroadcast(broadcastID uint, status string, sent, failed, skipped int) {
	database.DB.Model(&models.Broadcast{}).Where("id = ?", broadcastID).
		Updates(map[string]any{"status": status, "sent": sent, "failed": failed, "skipped": skipped})
	_ = database.DB.Model(&models.ScheduledMessage{}).Where("broadcast_id = ?", broadcastID).Update("status", status).Error
}

// waitConnected menunggu socket WA agent benar-benar tersambung hingga max durasi (poll tiap 3 detik).
func waitConnected(agentID uint, max time.Duration) bool {
	deadline := time.Now().Add(max)
	for {
		if services.WA(agentID).IsConnected() {
			return true
		}
		if time.Now().After(deadline) {
			return false
		}
		time.Sleep(3 * time.Second)
	}
}

func markRecipient(id uint, status, errMsg string) {
	database.DB.Model(&models.BroadcastRecipient{}).Where("id = ?", id).
		Updates(map[string]any{"status": status, "error": errMsg})
}

func updateBroadcastCounters(broadcastID uint, sent, failed, skipped int) {
	database.DB.Model(&models.Broadcast{}).Where("id = ?", broadcastID).
		Updates(map[string]any{"sent": sent, "failed": failed, "skipped": skipped})
}

// normalizeBroadcastDelay memaksa jeda min/maks ke rentang yang aman & konsisten.
// minD diangkat ke minBroadcastDelay bila terlalu kecil; maxD minimal sama dengan minD.
func normalizeBroadcastDelay(minD, maxD int) (int, int) {
	if minD < minBroadcastDelay {
		minD = minBroadcastDelay
	}
	if maxD < minD {
		maxD = minD + 20
	}
	return minD, maxD
}

// normalizeBroadcastRest memvalidasi setelan istirahat berkala.
// every<=0 mematikan fitur. Jika aktif tapi durasi tak masuk akal, pakai default 60 dtk.
func normalizeBroadcastRest(every, duration int) (int, int) {
	if every <= 0 {
		return 0, 0
	}
	if duration <= 0 {
		duration = 60
	}
	return every, duration
}

// resumeBroadcastDelay membaca jeda yang dipersistensi saat broadcast dibuat, dengan
// fallback aman untuk data lama (sebelum kolom min/max_delay ada).
func resumeBroadcastDelay(broadcastID uint) (int, int) {
	var b models.Broadcast
	if err := database.DB.Select("min_delay", "max_delay").First(&b, broadcastID).Error; err != nil {
		return minBroadcastDelay, 30
	}
	return normalizeBroadcastDelay(b.MinDelay, b.MaxDelay)
}

func dailySentCount(agentID uint) int64 {
	now := time.Now()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	var n int64
	database.DB.Model(&models.BroadcastRecipient{}).
		Joins("JOIN broadcasts ON broadcasts.id = broadcast_recipients.broadcast_id").
		Where("broadcasts.agent_id = ? AND broadcast_recipients.status = ? AND broadcast_recipients.sent_at >= ?", agentID, "sent", startOfDay).
		Count(&n)
	return n
}

func personalize(tmpl, name string) string {
	n := name
	if n == "" {
		n = "kak"
	}
	return strings.ReplaceAll(tmpl, "{nama}", n)
}

// ListBroadcasts mengembalikan riwayat broadcast agent (dipaginate).
func ListBroadcasts(c *gin.Context) {
	id, ok := resolveAgent(c)
	if !ok {
		return
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	const limit = 10
	var total int64
	database.DB.Model(&models.Broadcast{}).Where("agent_id = ?", id).Count(&total)
	var bs []models.Broadcast
	database.DB.Where("agent_id = ?", id).Order("created_at desc").
		Offset((page - 1) * limit).Limit(limit).Find(&bs)
	c.JSON(200, gin.H{"data": bs, "total": total, "page": page, "limit": limit})
}

// BroadcastDetail = detail satu broadcast beserta status tiap penerima.
func BroadcastDetail(c *gin.Context) {
	id, ok := resolveAgent(c)
	if !ok {
		return
	}
	var b models.Broadcast
	if database.DB.Where("id = ? AND agent_id = ?", c.Param("bid"), id).First(&b).Error != nil {
		c.JSON(404, gin.H{"error": "Broadcast tidak ditemukan"})
		return
	}
	var recipients []models.BroadcastRecipient
	database.DB.Where("broadcast_id = ?", b.ID).Order("id asc").Find(&recipients)
	c.JSON(200, gin.H{"data": gin.H{"broadcast": b, "recipients": recipients}})
}

// optedOutSet mengembalikan himpunan nomor yang sudah opt-out untuk agent ini.
func optedOutSet(agentID uint) map[string]bool {
	var nums []string
	database.DB.Model(&models.OptOut{}).Where("agent_id = ?", agentID).Pluck("sender", &nums)
	set := make(map[string]bool, len(nums))
	for _, n := range nums {
		set[n] = true
	}
	return set
}

// contactNames = peta nomor -> nama profil (dari tabel Contact) untuk satu agent.
func contactNames(agentID uint) map[string]string {
	var cs []models.Contact
	database.DB.Where("agent_id = ?", agentID).Find(&cs)
	m := make(map[string]string, len(cs))
	for _, c := range cs {
		if c.Name != "" {
			m[c.Number] = c.Name
		}
	}
	return m
}

// OnAgentConnected dijalankan saat agent tersambung. Buku kontak (CRM) sengaja
// TIDAK lagi diisi otomatis dari buku alamat WhatsApp — dulu ini sumber "noise"
// (ratusan nomor yang belum tentu pernah berinteraksi). Kontak kini diisi user
// lewat impor (manual / nomor terkoneksi / CSV) + auto dari yang pernah chat.
// Buku alamat WA tetap tersedia on-demand sebagai salah satu sumber impor.
func OnAgentConnected(agentID uint) {
	// Rapikan data lama yang menyimpan pengirim sebagai LID -> nomor telepon.
	migrateLIDSenders(agentID)
}

// ChatContacts = kontak yang PERNAH chat agent ini (sumber broadcast paling aman). Tanpa yang opt-out.
func ChatContacts(c *gin.Context) {
	id, ok := resolveAgent(c)
	if !ok {
		return
	}
	var senders []string
	database.DB.Model(&models.ChatHistory{}).Where("agent_id = ? AND sender <> ''", id).
		Distinct().Pluck("sender", &senders)
	out := optedOutSet(id)
	names := contactNames(id)
	res := make([]gin.H, 0, len(senders))
	for _, s := range senders {
		if !out[s] {
			res = append(res, gin.H{"number": s, "name": names[s]})
		}
	}
	c.JSON(200, gin.H{"data": res})
}

// WAContacts = buku alamat akun WhatsApp yang tertaut (lebih berisiko, banyak yang belum tentu opt-in).
func WAContacts(c *gin.Context) {
	id, ok := resolveAgent(c)
	if !ok {
		return
	}
	if !services.WA(id).IsConnected() {
		c.JSON(400, gin.H{"error": "WhatsApp belum tersambung"})
		return
	}
	contacts, err := services.WA(id).GetContacts()
	if err != nil {
		c.JSON(502, gin.H{"error": err.Error()})
		return
	}
	out := optedOutSet(id)
	res := make([]services.WAContact, 0, len(contacts))
	for _, ct := range contacts {
		if !out[ct.Number] {
			res = append(res, ct)
		}
	}
	c.JSON(200, gin.H{"data": res})
}

// isOptOutKeyword mendeteksi permintaan berhenti (STOP/BERHENTI).
func isOptOutKeyword(text string) bool {
	switch strings.ToLower(strings.TrimSpace(text)) {
	case "stop", "berhenti", "unsub", "unsubscribe", "cancel":
		return true
	}
	return false
}
