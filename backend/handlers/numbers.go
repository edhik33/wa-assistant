package handlers

import (
	"wa-assistant/backend/database"
	"wa-assistant/backend/models"
	"wa-assistant/backend/services"

	"github.com/gin-gonic/gin"
)

func GetNumberStatus(c *gin.Context) {
	m := services.WA(currentAgentID(c))
	number, name := m.GetInfo()
	c.JSON(200, gin.H{"status": m.GetStatus(), "qr": m.GetQR(), "number": number, "name": name})
}

func ConnectNumber(c *gin.Context) {
	id := currentAgentID(c)
	var a models.Agent
	database.DB.First(&a, id)
	status, err := services.WA(id).Connect(a.DeviceJID)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"status": status})
}
