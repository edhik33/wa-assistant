package handlers

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"strconv"
	"strings"
	"time"

	"wa-assistant/backend/database"
	"wa-assistant/backend/models"
	"wa-assistant/backend/services"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type scheduleRecipient struct {
	Number string `json:"number"`
	Name   string `json:"name"`
}

// CreateSchedule menjadwalkan broadcast untuk waktu tertentu (multipart, bisa dengan lampiran).
func CreateSchedule(c *gin.Context) {
	id, ok := resolveAgent(c)
	if !ok {
		return
	}
	tid := currentTenantID(c)
	if !tenantPlanAllows(tid, featSchedule) {
		c.JSON(403, gin.H{"error": planFeatureMessage})
		return
	}

	message := c.PostForm("message")
	if strings.TrimSpace(message) == "" {
		c.JSON(400, gin.H{"error": "Pesan wajib diisi"})
		return
	}
	runAt, err := time.Parse(time.RFC3339, c.PostForm("run_at"))
	if err != nil {
		c.JSON(400, gin.H{"error": "Waktu jadwal tidak valid"})
		return
	}
	if runAt.Before(time.Now().Add(-time.Minute)) {
		c.JSON(400, gin.H{"error": "Waktu jadwal sudah lewat"})
		return
	}

	var reqRecipients []scheduleRecipient
	if json.Unmarshal([]byte(c.PostForm("recipients")), &reqRecipients) != nil || len(reqRecipients) == 0 {
		c.JSON(400, gin.H{"error": "Penerima wajib diisi"})
		return
	}
	if len(reqRecipients) > 1000 {
		c.JSON(400, gin.H{"error": "Maksimal 1000 penerima per jadwal"})
		return
	}
	seen := map[string]bool{}
	clean := make([]scheduleRecipient, 0, len(reqRecipients))
	for _, r := range reqRecipients {
		num := services.NormalizePhone(r.Number)
		if num == "" || seen[num] {
			continue
		}
		seen[num] = true
		clean = append(clean, scheduleRecipient{Number: num, Name: strings.TrimSpace(r.Name)})
	}
	if len(clean) == 0 {
		c.JSON(400, gin.H{"error": "Tidak ada nomor valid"})
		return
	}
	minD, _ := strconv.Atoi(c.PostForm("min_delay"))
	maxD, _ := strconv.Atoi(c.PostForm("max_delay"))
	if minD < 5 {
		minD = 10
	}
	if maxD < minD {
		maxD = minD + 20
	}

	consent := parseConsentAttestation(
		c.PostForm("consent_category"), c.PostForm("consent_source"),
		c.PostForm("consent_granted_at"), c.PostForm("consent_note"),
		c.PostForm("consent_confirmed") == "true",
	)
	guardRecipients := make([]broadcastGuardRecipient, 0, len(clean))
	for _, recipient := range clean {
		guardRecipients = append(guardRecipients, broadcastGuardRecipient{Number: recipient.Number, Name: recipient.Name})
	}
	assessment := assessBroadcast(id, message, guardRecipients, consent, &runAt)
	if assessment.Level == "high" && !canOverrideBroadcastRisk(c) {
		c.JSON(403, gin.H{"error": "Hanya owner yang dapat menyimpan jadwal dengan risiko tinggi", "assessment": assessment})
		return
	}
	acknowledged := c.PostForm("risk_acknowledged") == "true"
	overridePhrase := c.PostForm("override_phrase")
	overrideReason := strings.TrimSpace(c.PostForm("override_reason"))
	if confirmationError := validateRiskConfirmation(assessment, acknowledged, overridePhrase, overrideReason); confirmationError != "" {
		c.JSON(422, gin.H{"error": confirmationError, "assessment": assessment})
		return
	}

	eligible := make([]scheduleRecipient, 0, assessment.EligibleRecipients)
	for _, recipient := range clean {
		if assessment.eligibleNumbers[recipient.Number] {
			eligible = append(eligible, recipient)
		}
	}
	recJSON, err := json.Marshal(eligible)
	if err != nil {
		c.JSON(500, gin.H{"error": "Gagal menyiapkan penerima"})
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
	s := models.ScheduledMessage{
		TenantID: tid, AgentID: id, RunAt: runAt, Message: message,
		Recipients: string(recJSON), RecipientCount: len(eligible),
		MinDelay: minD, MaxDelay: maxD, Status: "scheduled",
		ConsentCategory: consent.Category, ConsentSource: consent.Source,
		RiskLevel: assessment.Level, RiskReasons: assessmentReasonsJSON(assessment),
		RiskAcknowledged: acknowledged || assessment.Level == "high",
		OverrideReason:   overrideReason, OverrideBy: overrideBy, OverrideAt: overrideAt,
	}
	if fh, ferr := c.FormFile("file"); ferr == nil {
		f, e := fh.Open()
		if e != nil {
			c.JSON(400, gin.H{"error": "Gagal membaca lampiran"})
			return
		}
		defer f.Close()
		data, readErr := io.ReadAll(f)
		if readErr != nil {
			c.JSON(400, gin.H{"error": "Gagal membaca lampiran"})
			return
		}
		s.Mimetype = fh.Header.Get("Content-Type")
		if s.Mimetype == "" {
			s.Mimetype = "application/octet-stream"
		}
		s.FileName = fh.Filename
		s.MediaType = "document"
		if strings.HasPrefix(s.Mimetype, "image/") {
			s.MediaType = "image"
		} else if strings.HasPrefix(s.Mimetype, "video/") {
			s.MediaType = "video"
		}
		s.MediaPath = storeMedia(id, data, s.Mimetype, fh.Filename)
	}
	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		if err := recordAttestedConsents(tx, id, c.GetUint("user_id"), guardRecipients, consent, assessment.eligibleNumbers); err != nil {
			return err
		}
		return tx.Create(&s).Error
	}); err != nil {
		log.Printf("Gagal membuat jadwal agent %d: %v", id, err)
		c.JSON(500, gin.H{"error": "Gagal membuat jadwal"})
		return
	}
	c.JSON(200, gin.H{"data": s, "assessment": assessment})
}

// ListSchedules = daftar jadwal agent.
func ListSchedules(c *gin.Context) {
	id, ok := resolveAgent(c)
	if !ok {
		return
	}
	var ss []models.ScheduledMessage
	database.DB.Where("agent_id = ?", id).Order("run_at asc").Limit(300).Find(&ss)
	c.JSON(200, gin.H{"data": ss})
}

// CancelSchedule membatalkan jadwal yang belum jalan.
func CancelSchedule(c *gin.Context) {
	id, ok := resolveAgent(c)
	if !ok {
		return
	}
	database.DB.Model(&models.ScheduledMessage{}).
		Where("id = ? AND agent_id = ? AND status = ?", c.Param("sid"), id, "scheduled").
		Update("status", "cancelled")
	c.JSON(200, gin.H{"ok": true})
}

// StartScheduler mengecek jadwal & follow-up yang jatuh tempo tiap menit & menjalankannya.
func StartScheduler() {
	StartSchedulerCtx(context.Background())
}

// StartSchedulerCtx adalah versi lifecycle-aware dari scheduler; berhenti saat ctx dibatalkan.
func StartSchedulerCtx(ctx context.Context) {
	go func() {
		processDueSchedules()
		go processDueFollowUps()
		t := time.NewTicker(1 * time.Minute)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				log.Println("Scheduler berhenti")
				return
			case <-t.C:
				processDueSchedules()
				// Follow-up dijalankan terpisah agar tak menahan jadwal.
				go processDueFollowUps()
			}
		}
	}()
}

func processDueSchedules() {
	var due []models.ScheduledMessage
	if err := database.DB.Where("status = ? AND run_at <= ?", "scheduled", time.Now()).Find(&due).Error; err != nil {
		log.Printf("Scheduler query error: %v", err)
		return
	}
	for _, s := range due {
		if !tenantWAActive(s.TenantID) {
			continue // tenant tidak aktif -> tunda (tetap scheduled)
		}
		if !services.WA(s.AgentID).IsConnected() {
			continue // WA belum tersambung -> tunda, coba lagi menit berikutnya
		}
		if err := database.DB.Model(&models.ScheduledMessage{}).Where("id = ? AND status = ?", s.ID, "scheduled").Update("status", "running").Error; err != nil {
			log.Printf("Scheduler gagal update jadwal %d: %v", s.ID, err)
			continue
		}
		fireScheduled(s)
	}
}

// fireScheduled membuat broadcast dari jadwal lalu menjalankannya.
func fireScheduled(s models.ScheduledMessage) {
	var recs []scheduleRecipient
	if err := json.Unmarshal([]byte(s.Recipients), &recs); err != nil {
		log.Printf("Scheduler gagal parse penerima jadwal %d: %v", s.ID, err)
		_ = database.DB.Model(&models.ScheduledMessage{}).Where("id = ?", s.ID).Update("status", "failed").Error
		return
	}

	b := models.Broadcast{
		TenantID: s.TenantID, AgentID: s.AgentID, Message: s.Message, Status: "pending",
		MediaType: s.MediaType, MediaPath: s.MediaPath, FileName: s.FileName, Mimetype: s.Mimetype,
		ConsentCategory: s.ConsentCategory, ConsentSource: s.ConsentSource,
		RiskLevel: s.RiskLevel, RiskReasons: s.RiskReasons, RiskAcknowledged: s.RiskAcknowledged,
		OverrideReason: s.OverrideReason, OverrideBy: s.OverrideBy, OverrideAt: s.OverrideAt,
	}
	var recipients []models.BroadcastRecipient
	for _, r := range recs {
		recipients = append(recipients, models.BroadcastRecipient{Number: r.Number, Name: r.Name, Status: "pending"})
	}
	b.Total = len(recipients)
	if err := database.DB.Create(&b).Error; err != nil {
		log.Printf("Scheduler gagal membuat broadcast jadwal %d: %v", s.ID, err)
		_ = database.DB.Model(&models.ScheduledMessage{}).Where("id = ?", s.ID).Update("status", "failed").Error
		return
	}
	for i := range recipients {
		recipients[i].BroadcastID = b.ID
	}
	if len(recipients) > 0 {
		if err := database.DB.Create(&recipients).Error; err != nil {
			log.Printf("Scheduler gagal membuat penerima broadcast %d: %v", b.ID, err)
			_ = database.DB.Model(&models.ScheduledMessage{}).Where("id = ?", s.ID).Update("status", "failed").Error
			return
		}
	}
	// Status jadwal tetap "running"; disinkronkan ke hasil akhir broadcast oleh finishBroadcast.
	if err := database.DB.Model(&models.ScheduledMessage{}).Where("id = ?", s.ID).Update("broadcast_id", b.ID).Error; err != nil {
		log.Printf("Scheduler gagal link broadcast jadwal %d: %v", s.ID, err)
	}

	go runBroadcast(b.ID, s.AgentID, s.MinDelay, s.MaxDelay)
}

// CleanupStuckSchedules menandai jadwal yang "running" saat server mati sebagai interrupted.
func CleanupStuckSchedules() {
	if err := database.DB.Model(&models.ScheduledMessage{}).Where("status = ?", "running").Update("status", "interrupted").Error; err != nil {
		log.Printf("Cleanup stuck schedule gagal: %v", err)
	}
}
