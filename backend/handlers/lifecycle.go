package handlers

import (
	"log"
	"time"

	"wa-assistant/backend/database"
	"wa-assistant/backend/models"
	"wa-assistant/backend/services"
)

// StartSubscriptionSweep menjalankan pengecekan langganan berkala di background.
func StartSubscriptionSweep(interval time.Duration) {
	go func() {
		RunSubscriptionSweep()
		ticker := time.NewTicker(interval)
		for range ticker.C {
			RunSubscriptionSweep()
		}
	}()
}

// RunSubscriptionSweep menandai langganan/trial yang habis sebagai expired,
// lalu memutus sesi WhatsApp tenant yang tidak lagi aktif (hemat resource VPS).
func RunSubscriptionSweep() {
	now := time.Now()

	// 1. Subscription aktif yang sudah lewat masa berlaku -> expired.
	database.DB.Model(&models.Subscription{}).
		Where("status = ? AND ends_at < ?", "active", now).
		Update("status", "expired")

	// 2. Tenant 'active' yang subscription-nya tidak lagi aktif -> expired.
	var expiredTenantIDs []uint
	database.DB.Model(&models.Subscription{}).
		Where("status <> ?", "active").Pluck("tenant_id", &expiredTenantIDs)
	if len(expiredTenantIDs) > 0 {
		database.DB.Model(&models.Tenant{}).
			Where("status = ? AND id IN ?", models.TenantActive, expiredTenantIDs).
			Update("status", models.TenantExpired)
	}

	// 3. Tenant trial yang masa cobanya habis -> expired.
	database.DB.Model(&models.Tenant{}).
		Where("status = ? AND trial_ends_at IS NOT NULL AND trial_ends_at < ?", models.TenantTrial, now).
		Update("status", models.TenantExpired)

	// 4. Putus sesi WA milik tenant yang tidak aktif (device tetap tersimpan).
	suspendInactiveTenantSessions()
}

func suspendInactiveTenantSessions() {
	var agents []models.Agent
	database.DB.Find(&agents)
	for _, a := range agents {
		if tenantWAActive(a.TenantID) {
			continue
		}
		if services.WA(a.ID).GetStatus() == "connected" {
			services.WA(a.ID).Suspend()
			log.Printf("Sesi WA agent %d (tenant %d) di-suspend: langganan tidak aktif", a.ID, a.TenantID)
		}
	}
}
