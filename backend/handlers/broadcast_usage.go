package handlers

import (
	"time"

	"wa-assistant/backend/config"
	"wa-assistant/backend/database"
	"wa-assistant/backend/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// broadcastMonthlyLimit = batas pesan broadcast per bulan untuk tenant. 0 = tanpa batas.
func broadcastMonthlyLimit(tenantID uint) int {
	var t models.Tenant
	if database.DB.Preload("Plan").First(&t, tenantID).Error != nil {
		return 0
	}
	if t.Plan != nil {
		return t.Plan.MaxBroadcastMonthly // 0 = unlimited
	}
	// Tanpa plan (trial): batas wajar untuk cegah penyalahgunaan.
	return config.EnvInt("TRIAL_BROADCAST_MONTHLY", 200)
}

// broadcastMonthlyUsed = jumlah pesan broadcast terkirim tenant bulan ini.
func broadcastMonthlyUsed(tenantID uint) int {
	var u models.BroadcastUsage
	if database.DB.Where("tenant_id = ? AND period = ?", tenantID, currentPeriod()).First(&u).Error != nil {
		return 0
	}
	return u.Sent
}

// broadcastQuotaRemaining = sisa kuota broadcast bulan ini. -1 = tanpa batas.
func broadcastQuotaRemaining(tenantID uint) int {
	limit := broadcastMonthlyLimit(tenantID)
	if limit <= 0 {
		return -1
	}
	used := broadcastMonthlyUsed(tenantID)
	if used >= limit {
		return 0
	}
	return limit - used
}

// incrementBroadcastUsage menambah n pesan ke pemakaian broadcast bulan berjalan (upsert).
func incrementBroadcastUsage(tenantID uint, n int) {
	if n <= 0 {
		return
	}
	period := currentPeriod()
	_ = database.DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "tenant_id"}, {Name: "period"}},
		DoUpdates: clause.Assignments(map[string]interface{}{
			"sent":       gorm.Expr("sent + ?", n),
			"updated_at": time.Now(),
		}),
	}).Create(&models.BroadcastUsage{TenantID: tenantID, Period: period, Sent: n, UpdatedAt: time.Now()}).Error
}
