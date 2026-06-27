package handlers

import (
	"encoding/json"
	"io"
	"log"
	"math/rand"
	"os"
	"strconv"
	"strings"
	"time"

	"wa-assistant/backend/config"
	"wa-assistant/backend/database"
	"wa-assistant/backend/models"
	"wa-assistant/backend/services"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// minBroadcastDelay = jeda minimum antar pesan (detik) yang dipaksakan demi keamanan nomor,
// berapa pun yang dikirim pengguna.
const minBroadcastDelay = 8

// broadcastWarmupSchedule = batas harian bertahap untuk nomor yang belum lama dipakai broadcast.
// Indeks ke-0 = hari aktif broadcast pertama, dst. Setelah daftar habis, pakai batas penuh
// (BROADCAST_DAILY_CAP). Tujuannya meniru pemanasan manual nomor baru agar tidak langsung blast.
var broadcastWarmupSchedule = []int{20, 40, 80, 120, 160}

// CheckNumbers memeriksa daftar nomor apakah terdaftar di WhatsApp sebelum broadcast.
func CheckNumbers(c *gin.Context) {
	id, ok := resolveAgent(c)
	if !ok {
		return
	}
	var req struct {
		Numbers []string `json:"numbers"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || len(req.Numbers) == 0 {
		c.JSON(400, gin.H{"error": "Daftar nomor kosong"})
		return
	}
	if !services.WA(id).IsConnected() {
		c.JSON(400, gin.H{"error": "WhatsApp belum tersambung"})
		return
	}
	res, err := services.WA(id).CheckNumbers(req.Numbers)
	if err != nil {
		c.JSON(502, gin.H{"error": err.Error()})
		return
	}
	// Tandai kontak "hangat" = pernah ada percakapan tercatat dengan agent ini.
	// Riwayat lama bisa tersimpan sebagai LID, bukan nomor telepon — jadi cocokkan keduanya.
	keyByNumber := make(map[string][]string, len(res))
	allKeys := make([]string, 0, len(res)*2)
	for _, r := range res {
		keys := []string{r.Number}
		if lid := services.WA(id).LIDForPN(r.Number); lid != "" {
			keys = append(keys, lid)
		}
		keyByNumber[r.Number] = keys
		allKeys = append(allKeys, keys...)
	}
	warmKeySet := map[string]bool{}
	if len(allKeys) > 0 {
		var warm []string
		database.DB.Model(&models.ChatHistory{}).
			Where("agent_id = ? AND sender IN ?", id, allKeys).
			Distinct().Pluck("sender", &warm)
		for _, w := range warm {
			warmKeySet[w] = true
		}
	}
	isWarm := func(number string) bool {
		for _, k := range keyByNumber[number] {
			if warmKeySet[k] {
				return true
			}
		}
		return false
	}
	data := make([]gin.H, 0, len(res))
	for _, r := range res {
		data = append(data, gin.H{"input": r.Input, "number": r.Number, "registered": r.Registered, "warm": isWarm(r.Number)})
	}
	c.JSON(200, gin.H{
		"data": data,
		"summary": gin.H{
			"sent_today": dailySentCount(id),
			"daily_cap":  effectiveDailyCap(id),
		},
	})
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
	if len(reqRecipients) > 1000 {
		c.JSON(400, gin.H{"error": "Maksimal 1000 penerima per broadcast"})
		return
	}

	minD, _ := strconv.Atoi(c.PostForm("min_delay"))
	maxD, _ := strconv.Atoi(c.PostForm("max_delay"))
	minD, maxD = normalizeBroadcastDelay(minD, maxD)
	restEvery, _ := strconv.Atoi(c.PostForm("rest_every"))
	restDuration, _ := strconv.Atoi(c.PostForm("rest_duration"))
	restEvery, restDuration = normalizeBroadcastRest(restEvery, restDuration)

	consent := parseConsentAttestation(
		c.PostForm("consent_category"), c.PostForm("consent_source"),
		c.PostForm("consent_granted_at"), c.PostForm("consent_note"),
		c.PostForm("consent_confirmed") == "true",
	)
	b := models.Broadcast{}

	guardRecipients := normalizeGuardRecipients(reqRecipients)
	if len(guardRecipients) == 0 {
		c.JSON(400, gin.H{"error": "Tidak ada nomor valid"})
		return
	}

	assessment := assessBroadcast(id, message, guardRecipients, consent, nil)
	if assessment.Level == "high" && !canOverrideBroadcastRisk(c) {
		c.JSON(403, gin.H{"error": "Hanya owner yang dapat melanjutkan broadcast dengan risiko tinggi", "assessment": assessment})
		return
	}
	acknowledged := c.PostForm("risk_acknowledged") == "true"
	overridePhrase := c.PostForm("override_phrase")
	overrideReason := strings.TrimSpace(c.PostForm("override_reason"))
	if confirmationError := validateRiskConfirmation(assessment, acknowledged, overridePhrase, overrideReason); confirmationError != "" {
		c.JSON(422, gin.H{"error": confirmationError, "assessment": assessment})
		return
	}

	var overrideBy *uint
	var overrideAt *time.Time
	if assessment.Level == "high" {
		uid := c.GetUint("user_id")
		now := time.Now()
		overrideBy = &uid
		overrideAt = &now
	}
	b.TenantID = tid
	b.AgentID = id
	b.Message = message
	b.Status = "pending"
	b.ConsentCategory = consent.Category
	b.ConsentSource = consent.Source
	b.RiskLevel = assessment.Level
	b.RiskReasons = assessmentReasonsJSON(assessment)
	b.RiskAcknowledged = acknowledged || assessment.Level == "high"
	b.OverrideReason = overrideReason
	b.OverrideBy = overrideBy
	b.OverrideAt = overrideAt
	b.Total = len(guardRecipients)
	b.MinDelay = minD
	b.MaxDelay = maxD
	b.RestEvery = restEvery
	b.RestDuration = restDuration

	// Simpan lampiran setelah guard lolos agar request yang diblokir tidak meninggalkan file yatim.
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
			}
			b.MediaPath = storeMedia(id, data, b.Mimetype, fh.Filename)
		}
	}

	var recipients []models.BroadcastRecipient
	for _, r := range guardRecipients {
		status := "pending"
		reason := ""
		if !assessment.eligibleNumbers[r.Number] {
			status = "skipped"
			reason = assessment.excludedReasons[r.Number]
			b.Skipped++
		}
		recipients = append(recipients, models.BroadcastRecipient{Number: r.Number, Name: r.Name, Status: status, Error: reason})
	}

	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		if err := recordAttestedConsents(tx, id, c.GetUint("user_id"), guardRecipients, consent, assessment.eligibleNumbers); err != nil {
			return err
		}
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
	c.JSON(200, gin.H{"data": b, "assessment": assessment})
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
	if b.Status == models.BroadcastPending || b.Status == models.BroadcastInterrupted {
		finalizeCancelledBroadcast(b.ID)
		c.JSON(200, gin.H{"message": "Broadcast dibatalkan", "status": models.BroadcastCancelled})
		return
	}
	// Kalau running, minta worker berhenti di checkpoint.
	res := database.DB.Model(&models.Broadcast{}).
		Where("id = ? AND agent_id = ? AND status = ?", b.ID, id, models.BroadcastRunning).
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
	database.DB.Where("status IN ?", []string{models.BroadcastRunning, models.BroadcastInterrupted, models.BroadcastPending}).Find(&bs)
	for _, b := range bs {
		var pending int64
		database.DB.Model(&models.BroadcastRecipient{}).Where("broadcast_id = ? AND status = ?", b.ID, "pending").Count(&pending)
		if pending == 0 {
			_ = database.DB.Model(&models.Broadcast{}).Where("id = ?", b.ID).Update("status", "done").Error
			continue
		}
		go resumeBroadcast(b.ID, b.AgentID)
	}
}

// resumeBroadcast menunggu WA agent tersambung (maks ~90 detik) lalu melanjutkan pengiriman.
func resumeBroadcast(broadcastID, agentID uint) {
	for i := 0; i < 18; i++ {
		if services.WA(agentID).IsConnected() {
			minD, maxD := resumeBroadcastDelay(broadcastID)
			log.Printf("Melanjutkan broadcast %d (agent %d), jeda %d-%d dtk", broadcastID, agentID, minD, maxD)
			runBroadcast(broadcastID, agentID, minD, maxD)
			return
		}
		time.Sleep(5 * time.Second)
	}
	_ = database.DB.Model(&models.Broadcast{}).Where("id = ?", broadcastID).Update("status", "interrupted").Error
	log.Printf("Broadcast %d belum dilanjutkan: WA agent %d tidak tersambung", broadcastID, agentID)
}

// runBroadcast mengirim pesan satu per satu dengan jeda ritme yang dipilih pengguna.
func runBroadcast(broadcastID, agentID uint, minD, maxD int) {
	_ = database.DB.Model(&models.Broadcast{}).Where("id = ?", broadcastID).Update("status", "running").Error

	var b models.Broadcast
	database.DB.First(&b, broadcastID)
	var recipients []models.BroadcastRecipient
	database.DB.Where("broadcast_id = ? AND status = ?", broadcastID, "pending").Find(&recipients)

	// Baca lampiran sekali saja (kalau ada), dipakai untuk semua penerima.
	var mediaBytes []byte
	if b.MediaType != "" && b.MediaPath != "" {
		mediaBytes, _ = os.ReadFile(b.MediaPath)
	}

	dailyCap := effectiveDailyCap(agentID)
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
	daily := int(dailySentCount(agentID))

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
		// Hormati batas operasional harian milik aplikasi.
		if daily >= dailyCap {
			markRecipient(r.ID, "skipped", "batas harian tercapai")
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
		case b.MediaType == "image" && len(mediaBytes) > 0:
			sendErr = services.WA(agentID).SendImage(r.Number, msg, b.Mimetype, mediaBytes)
		case b.MediaType == "document" && len(mediaBytes) > 0:
			sendErr = services.WA(agentID).SendDocument(r.Number, b.FileName, b.Mimetype, msg, mediaBytes)
		default:
			sendErr = services.WA(agentID).SendText(r.Number, msg)
		}
		if sendErr != nil {
			// Error karena koneksi putus saat kirim -> jeda broadcast, JANGAN tandai gagal
			// (penerima tetap pending agar bisa dilanjutkan saat WA tersambung lagi).
			if strings.Contains(sendErr.Error(), "tidak terhubung") {
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
			daily++         // hitung pemakaian jatah harian secara in-memory
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

// configuredDailyCap = batas harian penuh dari konfigurasi (target akhir setelah warm-up).
func configuredDailyCap() int {
	return config.EnvInt("BROADCAST_DAILY_CAP", 200)
}

// effectiveDailyCap = batas harian setelah memperhitungkan masa pemanasan (warm-up) nomor.
// Nomor baru mulai dari batas kecil lalu naik bertahap tiap hari aktif broadcast hingga
// mencapai batas penuh. Bisa dimatikan dengan BROADCAST_WARMUP=off.
func effectiveDailyCap(agentID uint) int {
	full := configuredDailyCap()
	if strings.EqualFold(config.Env("BROADCAST_WARMUP", "on"), "off") {
		return full
	}
	day := broadcastActiveDayIndex(agentID) // 1 = hari aktif broadcast pertama
	if day >= 1 && day <= len(broadcastWarmupSchedule) {
		if cap := broadcastWarmupSchedule[day-1]; cap < full {
			return cap
		}
	}
	return full
}

// broadcastActiveDayIndex = nomor urut hari aktif broadcast agent ini, termasuk hari ini.
// Dihitung dari jumlah tanggal berbeda dengan pengiriman SEBELUM hari ini, lalu +1 untuk hari ini,
// agar nilainya stabil sepanjang hari berjalan (tidak naik di tengah broadcast).
func broadcastActiveDayIndex(agentID uint) int {
	now := time.Now()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	var prior int64
	database.DB.Model(&models.BroadcastRecipient{}).
		Joins("JOIN broadcasts ON broadcasts.id = broadcast_recipients.broadcast_id").
		Where("broadcasts.agent_id = ? AND broadcast_recipients.status = ? AND broadcast_recipients.sent_at < ?", agentID, "sent", startOfDay).
		Select("COUNT(DISTINCT DATE(broadcast_recipients.sent_at))").Scan(&prior)
	return int(prior) + 1
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

// OnAgentConnected mengisi tabel Contact dari buku alamat WA saat agent tersambung.
// Hanya menambah nomor yang belum punya nama (tidak menimpa nama hasil PushName/chat).
func OnAgentConnected(agentID uint) {
	contacts, err := services.WA(agentID).GetContacts()
	if err != nil || len(contacts) == 0 {
		return
	}
	var existing []models.Contact
	database.DB.Where("agent_id = ?", agentID).Find(&existing)
	have := make(map[string]bool, len(existing))
	for _, c := range existing {
		have[c.Number] = true
	}
	fresh := make([]models.Contact, 0)
	for _, ct := range contacts {
		if ct.Number == "" || ct.Name == "" || have[ct.Number] {
			continue
		}
		have[ct.Number] = true // cegah duplikat dalam batch yang sama
		fresh = append(fresh, models.Contact{AgentID: agentID, Number: ct.Number, Name: ct.Name})
	}
	if len(fresh) > 0 {
		database.DB.CreateInBatches(fresh, 200)
		log.Printf("Backfill kontak (agent %d): %d nama dari buku alamat WhatsApp", agentID, len(fresh))
	}
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
