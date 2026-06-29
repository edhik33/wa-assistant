package handlers

import (
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"wa-assistant/backend/database"
	"wa-assistant/backend/models"
	"wa-assistant/backend/services"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const broadcastOverridePhrase = services.BroadcastOverridePhrase

type broadcastGuardRecipient struct {
	Number string `json:"number"`
	Name   string `json:"name"`
}

type consentAttestation struct {
	Category  string
	Source    string
	GrantedAt time.Time
	Note      string
	Confirmed bool
}

type broadcastGuardFinding struct {
	Code           string `json:"code"`
	Severity       string `json:"severity"` // info, warning, danger, blocked
	Message        string `json:"message"`
	Recommendation string `json:"recommendation,omitempty"`
}

type broadcastAssessment struct {
	Level                   string                  `json:"level"` // low, medium, high, blocked
	Title                   string                  `json:"title"`
	CanProceed              bool                    `json:"can_proceed"`
	CanOverride             bool                    `json:"can_override"`
	RequiresAcknowledgement bool                    `json:"requires_acknowledgement"`
	RequiresOverride        bool                    `json:"requires_override"`
	TotalRecipients         int                     `json:"total_recipients"`
	EligibleRecipients      int                     `json:"eligible_recipients"`
	SendableToday           int                     `json:"sendable_today"`
	ExistingConsent         int                     `json:"existing_consent"`
	ConsentToRecord         int                     `json:"consent_to_record"`
	MissingConsent          int                     `json:"missing_consent"`
	OptedOut                int                     `json:"opted_out"`
	EngagedRecipients       int                     `json:"engaged_recipients"`
	NoInteraction           int                     `json:"no_interaction"`
	SentToday               int64                   `json:"sent_today"`
	DailyLimit              int                     `json:"daily_limit"`
	Findings                []broadcastGuardFinding `json:"findings"`
	OverridePhrase          string                  `json:"override_phrase,omitempty"`

	eligibleNumbers map[string]bool
	excludedReasons map[string]string
}

type broadcastPreflightRequest struct {
	Message          string                    `json:"message"`
	Recipients       []broadcastGuardRecipient `json:"recipients"`
	ConsentCategory  string                    `json:"consent_category"`
	ConsentSource    string                    `json:"consent_source"`
	ConsentGrantedAt string                    `json:"consent_granted_at"`
	ConsentNote      string                    `json:"consent_note"`
	ConsentConfirmed bool                      `json:"consent_confirmed"`
	RunAt            string                    `json:"run_at"`
}

// BroadcastConsentSummary mengembalikan ringkasan catatan lokal untuk tampilan Kontak.
// Angka ini berasal dari aktivitas ChatLoop, bukan quality rating atau verifikasi WhatsApp.
func BroadcastConsentSummary(c *gin.Context) {
	agentID, ok := resolveAgent(c)
	if !ok {
		return
	}

	var activeConsent, marketingConsent, optedOut, interacted int64
	database.DB.Model(&models.ContactConsent{}).
		Where("agent_id = ? AND revoked_at IS NULL", agentID).
		Distinct("number").Count(&activeConsent)
	database.DB.Model(&models.ContactConsent{}).
		Where("agent_id = ? AND category = ? AND revoked_at IS NULL", agentID, "marketing").
		Distinct("number").Count(&marketingConsent)
	database.DB.Model(&models.OptOut{}).
		Where("agent_id = ?", agentID).
		Count(&optedOut)
	database.DB.Model(&models.ChatHistory{}).
		Where("agent_id = ? AND message <> ''", agentID).
		Distinct("sender").Count(&interacted)

	c.JSON(200, gin.H{"data": gin.H{
		"active_consent":    activeConsent,
		"marketing_consent": marketingConsent,
		"interacted":        interacted,
		"opted_out":         optedOut,
	}})
}

func parseConsentAttestation(category, source, grantedAt, note string, confirmed bool) consentAttestation {
	a := consentAttestation{
		Category:  strings.TrimSpace(category),
		Source:    strings.TrimSpace(source),
		Note:      strings.TrimSpace(note),
		Confirmed: confirmed,
	}
	if grantedAt != "" {
		if parsed, err := time.Parse("2006-01-02", grantedAt); err == nil {
			a.GrantedAt = parsed
		}
	}
	return a
}

func validConsentAttestation(a consentAttestation) bool {
	return services.ValidBroadcastConsentEvidence(a.Category, a.Source, a.GrantedAt, a.Confirmed, time.Now())
}

func normalizeGuardRecipients(in []broadcastGuardRecipient) []broadcastGuardRecipient {
	seen := map[string]bool{}
	out := make([]broadcastGuardRecipient, 0, len(in))
	for _, r := range in {
		number := services.NormalizePhone(r.Number)
		if number == "" || seen[number] {
			continue
		}
		seen[number] = true
		out = append(out, broadcastGuardRecipient{Number: number, Name: strings.TrimSpace(r.Name)})
	}
	return out
}

func assessBroadcast(agentID uint, message string, recipients []broadcastGuardRecipient, consent consentAttestation, scheduledFor *time.Time) broadcastAssessment {
	recipients = normalizeGuardRecipients(recipients)
	assessment := broadcastAssessment{
		Level:           "low",
		Title:           "Risiko lebih rendah",
		TotalRecipients: len(recipients),
		DailyLimit:      0,
		Findings:        make([]broadcastGuardFinding, 0),
		eligibleNumbers: map[string]bool{},
		excludedReasons: map[string]string{},
	}
	if scheduledFor == nil || sameLocalDay(*scheduledFor, time.Now()) {
		assessment.SentToday = dailySentCount(agentID)
	}
	if !services.ValidBroadcastConsentCategory(consent.Category) {
		assessment.Findings = append(assessment.Findings, broadcastGuardFinding{
			Code: "invalid_category", Severity: "blocked",
			Message: "Pilih jenis pesan sebelum melanjutkan.",
		})
	}
	if len(recipients) == 0 {
		assessment.Findings = append(assessment.Findings, broadcastGuardFinding{
			Code: "empty_recipients", Severity: "blocked", Message: "Tidak ada penerima valid.",
		})
	}

	numbers := make([]string, 0, len(recipients))
	for _, r := range recipients {
		numbers = append(numbers, r.Number)
	}

	optedOut := map[string]bool{}
	if len(numbers) > 0 {
		var rows []models.OptOut
		database.DB.Where("agent_id = ? AND sender IN ?", agentID, numbers).Find(&rows)
		for _, row := range rows {
			optedOut[row.Sender] = true
		}
	}

	consented := map[string]bool{}
	if len(numbers) > 0 && services.ValidBroadcastConsentCategory(consent.Category) {
		var rows []models.ContactConsent
		database.DB.Where("agent_id = ? AND number IN ? AND category = ? AND revoked_at IS NULL", agentID, numbers, consent.Category).Find(&rows)
		for _, row := range rows {
			consented[row.Number] = true
		}
	}

	engaged := map[string]bool{}
	if len(numbers) > 0 {
		var senders []string
		database.DB.Model(&models.ChatHistory{}).
			Where("agent_id = ? AND sender IN ? AND message <> ''", agentID, numbers).
			Distinct().Pluck("sender", &senders)
		for _, sender := range senders {
			engaged[sender] = true
		}
	}

	attestationValid := validConsentAttestation(consent)
	for _, r := range recipients {
		switch {
		case optedOut[r.Number]:
			assessment.OptedOut++
			assessment.excludedReasons[r.Number] = "kontak sudah meminta berhenti"
		case consented[r.Number]:
			assessment.ExistingConsent++
			assessment.eligibleNumbers[r.Number] = true
		case attestationValid:
			assessment.ConsentToRecord++
			assessment.eligibleNumbers[r.Number] = true
		default:
			assessment.MissingConsent++
			assessment.excludedReasons[r.Number] = "catatan izin belum tersedia"
		}
	}
	assessment.EligibleRecipients = len(assessment.eligibleNumbers)

	for number := range assessment.eligibleNumbers {
		if engaged[number] {
			assessment.EngagedRecipients++
		} else {
			assessment.NoInteraction++
		}
	}

	if consent.Confirmed && !attestationValid {
		assessment.Findings = append(assessment.Findings, broadcastGuardFinding{
			Code: "invalid_consent_evidence", Severity: "blocked",
			Message:        "Sumber atau tanggal izin yang diisi tidak valid.",
			Recommendation: "Sumber dan tanggal bersifat opsional — kosongkan atau perbaiki (tanggal tidak boleh di masa depan).",
		})
	}
	if assessment.OptedOut > 0 {
		assessment.Findings = append(assessment.Findings, broadcastGuardFinding{
			Code: "opted_out", Severity: "blocked",
			Message: intText(assessment.OptedOut) + " penerima sudah meminta berhenti dan tidak akan dikirimi pesan.",
		})
	}
	if assessment.MissingConsent > 0 {
		assessment.Findings = append(assessment.Findings, broadcastGuardFinding{
			Code: "missing_consent", Severity: "blocked",
			Message:        intText(assessment.MissingConsent) + " penerima belum memiliki catatan izin dan tidak akan dikirimi pesan.",
			Recommendation: "Catat hanya izin yang benar-benar pernah diberikan penerima.",
		})
	}

	assessment.SendableToday = assessment.EligibleRecipients

	if assessment.EligibleRecipients == 0 {
		assessment.Level = "blocked"
		assessment.Title = "Belum bisa dikirim"
		assessment.Findings = append(assessment.Findings, broadcastGuardFinding{
			Code: "no_eligible_recipients", Severity: "blocked",
			Message: "Tidak ada penerima yang memenuhi syarat pengiriman.",
		})
	} else {
		// Kontak baru tetap boleh dikirimi setelah pengguna membaca peringatan. Riwayat
		// interaksi dipakai sebagai informasi risiko, bukan pembatas volume harian.
		warningRatio := consentWarningRatio(consent.Category)
		noInteractionRatio := float64(assessment.NoInteraction) / float64(assessment.EligibleRecipients)
		if noInteractionRatio > warningRatio {
			assessment.Level = "medium"
			assessment.Findings = append(assessment.Findings, broadcastGuardFinding{
				Code: "many_no_interaction", Severity: "warning",
				Message:        intText(assessment.NoInteraction) + " penerima belum pernah mengirim pesan ke nomor ini.",
				Recommendation: "Pastikan penerima memang memberi izin dan pahami risiko pembatasan WhatsApp.",
			})
		}

		for _, finding := range messageRiskFindings(message, assessment.EligibleRecipients) {
			assessment.Findings = append(assessment.Findings, finding)
			if assessment.Level == "low" {
				assessment.Level = "medium"
			}
		}
	}

	assessment.CanProceed = assessment.Level != "blocked" && assessment.SendableToday > 0
	assessment.RequiresAcknowledgement = assessment.Level == "medium" || assessment.Level == "high"
	assessment.RequiresOverride = assessment.Level == "high"
	assessment.CanOverride = assessment.Level == "high"
	switch assessment.Level {
	case "medium":
		assessment.Title = "Perlu ditinjau"
	case "high":
		assessment.Title = "Risiko tinggi"
		assessment.OverridePhrase = broadcastOverridePhrase
	}
	return assessment
}

// consentWarningRatio menentukan kapan kontak tanpa riwayat perlu diperingatkan.
// Peringatan ini tidak membatasi atau mengurangi jumlah penerima.
func consentWarningRatio(category string) float64 {
	if category == "marketing" {
		return 0.25
	}
	return 0.4
}

func messageRiskFindings(message string, recipientCount int) []broadcastGuardFinding {
	findings := make([]broadcastGuardFinding, 0)
	if recipientCount > 10 && !strings.Contains(message, "{nama}") {
		findings = append(findings, broadcastGuardFinding{
			Code: "no_personalization", Severity: "warning",
			Message: "Pesan tidak memakai {nama}; semua penerima akan menerima teks yang sama.",
		})
	}
	if strings.Contains(strings.ToLower(message), "http://") || strings.Contains(strings.ToLower(message), "https://") || strings.Contains(strings.ToLower(message), "www.") {
		findings = append(findings, broadcastGuardFinding{
			Code: "contains_link", Severity: "warning",
			Message: "Pesan mengandung tautan. Pastikan domain dikenal dan sesuai izin penerima.",
		})
	}
	letters := ""
	for _, r := range message {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') {
			letters += string(r)
		}
	}
	if len(letters) >= 10 && letters == strings.ToUpper(letters) {
		findings = append(findings, broadcastGuardFinding{
			Code: "all_caps", Severity: "warning", Message: "Pesan didominasi huruf kapital dan dapat terasa agresif.",
		})
	}
	if len([]rune(message)) > 700 {
		findings = append(findings, broadcastGuardFinding{
			Code: "long_message", Severity: "warning", Message: "Pesan cukup panjang dan lebih sulit dipindai penerima.",
		})
	}
	return findings
}

func intText(n int) string {
	return strconv.Itoa(n)
}

func BroadcastPreflight(c *gin.Context) {
	agentID, ok := resolveAgent(c)
	if !ok {
		return
	}
	var req broadcastPreflightRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Format pemeriksaan broadcast tidak valid"})
		return
	}
	if len(req.Recipients) > 1000 {
		c.JSON(400, gin.H{"error": "Maksimal 1000 penerima per pemeriksaan"})
		return
	}
	consent := parseConsentAttestation(req.ConsentCategory, req.ConsentSource, req.ConsentGrantedAt, req.ConsentNote, req.ConsentConfirmed)
	var scheduledFor *time.Time
	if req.RunAt != "" {
		if parsed, err := time.Parse(time.RFC3339, req.RunAt); err == nil {
			scheduledFor = &parsed
		}
	}
	assessment := assessBroadcast(agentID, req.Message, req.Recipients, consent, scheduledFor)
	if assessment.Level == "high" && !canOverrideBroadcastRisk(c) {
		assessment.Level = "blocked"
		assessment.CanOverride = false
		assessment.CanProceed = false
		assessment.RequiresAcknowledgement = false
		assessment.RequiresOverride = false
		assessment.Title = "Perlu persetujuan owner"
		assessment.Findings = append(assessment.Findings, broadcastGuardFinding{
			Code: "owner_approval_required", Severity: "blocked",
			Message: "Hanya owner yang dapat melanjutkan broadcast dengan risiko tinggi.",
		})
	}
	c.JSON(200, assessment)
}

func canOverrideBroadcastRisk(c *gin.Context) bool {
	return c.GetString("role") == "owner" || isSuperAdmin(c)
}

func sameLocalDay(a, b time.Time) bool {
	a = a.In(time.Local)
	b = b.In(time.Local)
	return a.Year() == b.Year() && a.YearDay() == b.YearDay()
}

func recordAttestedConsents(tx *gorm.DB, agentID, userID uint, recipients []broadcastGuardRecipient, consent consentAttestation, eligible map[string]bool) error {
	if !validConsentAttestation(consent) {
		return nil
	}
	// Tanggal izin opsional; bila kosong, pakai waktu pencatatan agar kolom tetap terisi.
	grantedAt := consent.GrantedAt
	if grantedAt.IsZero() {
		grantedAt = time.Now()
	}
	rows := make([]models.ContactConsent, 0, len(recipients))
	for _, recipient := range normalizeGuardRecipients(recipients) {
		if !eligible[recipient.Number] {
			continue
		}
		rows = append(rows, models.ContactConsent{
			AgentID: agentID, Number: recipient.Number, Category: consent.Category,
			Source: consent.Source, Note: consent.Note, GrantedAt: grantedAt, RecordedBy: userID,
		})
	}
	if len(rows) == 0 {
		return nil
	}
	return tx.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "agent_id"}, {Name: "number"}, {Name: "category"}},
		DoUpdates: clause.Assignments(map[string]interface{}{
			"source": consent.Source, "note": consent.Note, "granted_at": grantedAt,
			"revoked_at": nil, "recorded_by": userID, "updated_at": time.Now(),
		}),
	}).Create(&rows).Error
}

func assessmentReasonsJSON(assessment broadcastAssessment) string {
	b, _ := json.Marshal(assessment.Findings)
	return string(b)
}

func activeConsentSet(agentID uint, category string, numbers []string) map[string]bool {
	set := map[string]bool{}
	if category == "" || len(numbers) == 0 {
		return set
	}
	var rows []models.ContactConsent
	database.DB.Where("agent_id = ? AND category = ? AND number IN ? AND revoked_at IS NULL", agentID, category, numbers).Find(&rows)
	for _, row := range rows {
		set[row.Number] = true
	}
	return set
}

func validateRiskConfirmation(assessment broadcastAssessment, acknowledged bool, phrase, reason string) string {
	return services.ValidateBroadcastRiskConfirmation(
		assessment.Level, assessment.CanProceed, acknowledged, phrase, reason, assessment.Title,
	)
}
