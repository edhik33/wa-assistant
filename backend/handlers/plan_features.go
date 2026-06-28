package handlers

import (
	"wa-assistant/backend/database"
	"wa-assistant/backend/models"
)

// Nama fitur yang bisa dibatasi per paket (dipakai tenantPlanAllows).
const (
	featFollowUp   = "followup"
	featGroupGuard = "group_guard"
	featSchedule   = "schedule"
	featSheets     = "sheets"
)

// tenantPlanAllows menentukan apakah paket tenant mengizinkan sebuah fitur.
// Tenant tanpa plan (trial) diizinkan mencoba semua fitur — trial sudah dibatasi
// waktu, dan membiarkan mereka mencoba fitur premium membantu konversi.
func tenantPlanAllows(tenantID uint, feature string) bool {
	var t models.Tenant
	if database.DB.Preload("Plan").First(&t, tenantID).Error != nil {
		return false
	}
	if t.Plan == nil {
		return true // trial / tanpa plan
	}
	switch feature {
	case featFollowUp:
		return t.Plan.AllowFollowUp
	case featGroupGuard:
		return t.Plan.AllowGroupGuard
	case featSchedule:
		return t.Plan.AllowSchedule
	case featSheets:
		return t.Plan.AllowSheets
	default:
		return true
	}
}

// agentPlanAllows = versi yang mencari tenant dari agent (untuk jalur background
// yang hanya memegang agentID, mis. moderasi grup & ekspor closing).
func agentPlanAllows(agentID uint, feature string) bool {
	var a models.Agent
	if database.DB.Select("tenant_id").First(&a, agentID).Error != nil {
		return false
	}
	return tenantPlanAllows(a.TenantID, feature)
}

// planFeatureError = balasan 403 standar saat fitur tidak termasuk paket tenant.
const planFeatureMessage = "Fitur ini tidak termasuk dalam paket langganan kamu. Upgrade paket untuk memakainya."
