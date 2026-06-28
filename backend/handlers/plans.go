package handlers

import (
	"wa-assistant/backend/database"
	"wa-assistant/backend/models"

	"github.com/gin-gonic/gin"
)

// PublicPlans = daftar plan aktif untuk halaman harga / landing (tanpa auth).
func PublicPlans(c *gin.Context) {
	var plans []models.Plan
	database.DB.Where("is_active = ?", true).Order("sort_order asc").Find(&plans)
	c.JSON(200, gin.H{"data": plans})
}

// TenantUsage = ringkasan pemakaian tenant (nomor & kuota AI) untuk dashboard.
func TenantUsage(c *gin.Context) {
	tid := currentTenantID(c)
	var t models.Tenant
	if database.DB.Preload("Plan").First(&t, tid).Error != nil {
		c.JSON(404, gin.H{"error": "Tenant tidak ditemukan"})
		return
	}
	var numbers int64
	database.DB.Model(&models.Agent{}).Where("tenant_id = ?", tid).Count(&numbers)
	var usage models.AIUsage
	database.DB.Where("tenant_id = ? AND period = ?", tid, currentPeriod()).First(&usage)

	c.JSON(200, gin.H{
		"tenant":          t,
		"period":          currentPeriod(),
		"numbers_used":    numbers,
		"max_numbers":     planMaxNumbers(tid),
		"ai_replies_used": usage.Replies,
		"ai_replies_max":  aiReplyLimit(tid),
		"broadcast_used":  broadcastMonthlyUsed(tid),
		"broadcast_max":   broadcastMonthlyLimit(tid),
	})
}
