package handlers

import (
	"log"
	"math"
	"time"

	"wa-assistant/backend/database"
	"wa-assistant/backend/models"

	"github.com/gin-gonic/gin"
)

const testAITurnSender = "__test__"

func logAITurn(agentID uint, sender, userMessage, aiReply, model string, knowledgeUsedCount int, usedShippingTool, escalated bool, errText string, latencyMs int64) {
	if agentID == 0 {
		return
	}
	if err := database.DB.Create(&models.AITurn{
		AgentID:            agentID,
		Sender:             sender,
		UserMessage:        userMessage,
		AIReply:            aiReply,
		Model:              model,
		PromptVersion:      "legacy",
		KnowledgeUsedCount: knowledgeUsedCount,
		UsedShippingTool:   usedShippingTool,
		Escalated:          escalated,
		Error:              errText,
		LatencyMs:          latencyMs,
	}).Error; err != nil {
		log.Printf("Gagal mencatat AITurn (agent %d, %s): %v", agentID, sender, err)
	}
}

func AgentAIMetrics(c *gin.Context) {
	id, ok := resolveAgent(c)
	if !ok {
		return
	}

	now := time.Now()
	since := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).AddDate(0, 0, -6)
	var totalIncoming, aiReplies, escalated, toolShippingSuccess, toolShippingError, closingDetected, closingExported, aiErrors int64

	database.DB.Model(&models.ChatHistory{}).
		Where("agent_id = ? AND message <> '' AND created_at >= ?", id, since).
		Count(&totalIncoming)
	database.DB.Model(&models.AITurn{}).
		Where("agent_id = ? AND sender <> ? AND ai_reply <> '' AND created_at >= ?", id, testAITurnSender, since).
		Count(&aiReplies)
	database.DB.Model(&models.AITurn{}).
		Where("agent_id = ? AND sender <> ? AND escalated = ? AND created_at >= ?", id, testAITurnSender, true, since).
		Count(&escalated)
	database.DB.Model(&models.AITurn{}).
		Where("agent_id = ? AND sender <> ? AND used_shipping_tool = ? AND (`error` = '' OR `error` NOT LIKE ?) AND created_at >= ?", id, testAITurnSender, true, "shipping:%", since).
		Count(&toolShippingSuccess)
	database.DB.Model(&models.AITurn{}).
		Where("agent_id = ? AND sender <> ? AND used_shipping_tool = ? AND `error` LIKE ? AND created_at >= ?", id, testAITurnSender, true, "shipping:%", since).
		Count(&toolShippingError)
	database.DB.Model(&models.ClosingRecord{}).
		Where("agent_id = ? AND created_at >= ?", id, since).
		Count(&closingDetected)
	database.DB.Model(&models.ClosingRecord{}).
		Where("agent_id = ? AND status = ? AND created_at >= ?", id, "exported", since).
		Count(&closingExported)
	database.DB.Model(&models.AITurn{}).
		Where("agent_id = ? AND sender <> ? AND `error` LIKE ? AND created_at >= ?", id, testAITurnSender, "ai:%", since).
		Count(&aiErrors)

	escalationRate := 0.0
	if totalIncoming > 0 {
		escalationRate = math.Round((float64(escalated)/float64(totalIncoming))*10000) / 100
	}

	type totalRow struct {
		Date  string
		Total int64
	}
	type escalatedRow struct {
		Date      string
		Escalated int64
	}
	var totalRows []totalRow
	var escalatedRows []escalatedRow
	database.DB.Model(&models.ChatHistory{}).
		Select("DATE_FORMAT(created_at, '%Y-%m-%d') as date, COUNT(*) as total").
		Where("agent_id = ? AND message <> '' AND created_at >= ?", id, since).
		Group("date").
		Scan(&totalRows)
	database.DB.Model(&models.AITurn{}).
		Select("DATE_FORMAT(created_at, '%Y-%m-%d') as date, SUM(CASE WHEN escalated = true THEN 1 ELSE 0 END) as escalated").
		Where("agent_id = ? AND sender <> ? AND created_at >= ?", id, testAITurnSender, since).
		Group("date").
		Scan(&escalatedRows)

	totalsByDate := map[string]int64{}
	for _, row := range totalRows {
		totalsByDate[row.Date] = row.Total
	}
	escalatedByDate := map[string]int64{}
	for _, row := range escalatedRows {
		escalatedByDate[row.Date] = row.Escalated
	}

	trend := make([]gin.H, 0, 7)
	for i := 6; i >= 0; i-- {
		date := time.Now().AddDate(0, 0, -i).Format("2006-01-02")
		trend = append(trend, gin.H{
			"date":      date,
			"total":     totalsByDate[date],
			"escalated": escalatedByDate[date],
		})
	}

	c.JSON(200, gin.H{
		"total_incoming":        totalIncoming,
		"ai_replies":            aiReplies,
		"escalated":             escalated,
		"escalation_rate":       escalationRate,
		"tool_shipping_success": toolShippingSuccess,
		"tool_shipping_error":   toolShippingError,
		"closing_detected":      closingDetected,
		"closing_exported":      closingExported,
		"ai_errors":             aiErrors,
		"trend":                 trend,
	})
}
