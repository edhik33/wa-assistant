package handlers

import (
	"time"

	"wa-assistant/backend/config"
	"wa-assistant/backend/database"
	"wa-assistant/backend/models"

	"gorm.io/gorm"
)

// currentPeriod = bulan berjalan, format "2006-01" (kunci kuota AI bulanan).
func currentPeriod() string {
	return time.Now().Format("2006-01")
}

// aiReplyLimit = batas balasan AI per bulan untuk tenant. 0 = tanpa batas.
func aiReplyLimit(tenantID uint) int {
	var t models.Tenant
	if database.DB.Preload("Plan").First(&t, tenantID).Error != nil {
		return 0
	}
	if t.Plan != nil {
		return t.Plan.MaxAIRepliesMonthly // 0 = unlimited
	}
	// Tanpa plan (trial): batas wajar untuk cegah penyalahgunaan.
	return config.EnvInt("TRIAL_AI_REPLIES", 100)
}

// aiQuotaExceeded true bila tenant sudah melewati kuota balasan AI bulan ini.
func aiQuotaExceeded(tenantID uint) bool {
	limit := aiReplyLimit(tenantID)
	if limit <= 0 {
		return false
	}
	var usage models.AIUsage
	database.DB.Where("tenant_id = ? AND period = ?", tenantID, currentPeriod()).First(&usage)
	return usage.Replies >= limit
}

// incrementAIUsage menambah satu hitungan balasan AI tenant pada bulan berjalan (upsert).
func incrementAIUsage(tenantID uint) {
	period := currentPeriod()
	res := database.DB.Model(&models.AIUsage{}).
		Where("tenant_id = ? AND period = ?", tenantID, period).
		Updates(map[string]interface{}{
			"replies":    gorm.Expr("replies + 1"),
			"updated_at": time.Now(),
		})
	if res.Error == nil && res.RowsAffected == 0 {
		// Belum ada baris untuk bulan ini -> buat baru.
		database.DB.Create(&models.AIUsage{TenantID: tenantID, Period: period, Replies: 1, UpdatedAt: time.Now()})
	}
}
