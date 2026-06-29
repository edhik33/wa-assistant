package handlers

import (
	"context"
	"log"
	"time"

	"wa-assistant/backend/database"
	"wa-assistant/backend/models"
	"wa-assistant/backend/services"
)

// StartSubscriptionSweep menjalankan pengecekan langganan berkala di background.
func StartSubscriptionSweep(interval time.Duration) {
	StartSubscriptionSweepCtx(context.Background(), interval)
}

// StartSubscriptionSweepCtx adalah versi lifecycle-aware; berhenti saat ctx dibatalkan.
func StartSubscriptionSweepCtx(ctx context.Context, interval time.Duration) {
	if interval <= 0 {
		interval = time.Hour
	}
	go func() {
		safeRun("RunSubscriptionSweep", RunSubscriptionSweep)
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				log.Println("Subscription sweep berhenti")
				return
			case <-ticker.C:
				safeRun("RunSubscriptionSweep", RunSubscriptionSweep)
			}
		}
	}()
}

// RunSubscriptionSweep menandai langganan/trial yang habis sebagai expired,
// lalu memutus sesi WhatsApp tenant yang tidak lagi aktif (hemat resource VPS).
func RunSubscriptionSweep() {
	now := time.Now()

	// 1. Subscription aktif yang sudah lewat masa berlaku -> expired.
	if err := database.DB.Model(&models.Subscription{}).
		Where("status = ? AND ends_at < ?", "active", now).
		Update("status", "expired").Error; err != nil {
		log.Printf("Subscription sweep gagal expire subscription: %v", err)
	}

	// 2. Tenant 'active' yang subscription-nya tidak lagi aktif -> expired.
	var expiredTenantIDs []uint
	if err := database.DB.Model(&models.Subscription{}).
		Where("status <> ?", "active").Pluck("tenant_id", &expiredTenantIDs).Error; err != nil {
		log.Printf("Subscription sweep gagal ambil tenant expired: %v", err)
	}
	if len(expiredTenantIDs) > 0 {
		if err := database.DB.Model(&models.Tenant{}).
			Where("status = ? AND id IN ?", models.TenantActive, expiredTenantIDs).
			Update("status", models.TenantExpired).Error; err != nil {
			log.Printf("Subscription sweep gagal expire tenant aktif: %v", err)
		}
	}

	// 3. Tenant trial yang masa cobanya habis -> expired.
	if err := database.DB.Model(&models.Tenant{}).
		Where("status = ? AND trial_ends_at IS NOT NULL AND trial_ends_at < ?", models.TenantTrial, now).
		Update("status", models.TenantExpired).Error; err != nil {
		log.Printf("Subscription sweep gagal expire trial: %v", err)
	}

	// 4. Putus sesi WA milik tenant yang tidak aktif (device tetap tersimpan).
	suspendInactiveTenantSessions()
}

func suspendInactiveTenantSessions() {
	var agents []models.Agent
	if err := database.DB.Find(&agents).Error; err != nil {
		log.Printf("Subscription sweep gagal ambil agents: %v", err)
		return
	}
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
