package handlers

import (
	"log"
	"strconv"
	"strings"

	"wa-assistant/backend/database"
	"wa-assistant/backend/models"
	"wa-assistant/backend/services"

	"github.com/gin-gonic/gin"
	"go.mau.fi/whatsmeow/types"
)

// currentAgentID mengambil id agent dari path (:id). Default 1 untuk endpoint lama.
func currentAgentID(c *gin.Context) uint {
	if p := c.Param("id"); p != "" {
		if n, err := strconv.Atoi(p); err == nil {
			return uint(n)
		}
	}
	return 1
}

// OnWAMessage dipanggil saat ada pesan masuk untuk agent tertentu.
func OnWAMessage(agentID uint, sender types.JID, msg string) {
	var agent models.Agent
	prompt := "Kamu adalah asisten AI yang ramah. Jawab dalam bahasa Indonesia."
	tone := "ramah"
	if database.DB.First(&agent, agentID).Error == nil {
		if agent.SystemPrompt != "" {
			prompt = agent.SystemPrompt
		}
		if agent.Tone != "" {
			tone = agent.Tone
		}
	}

	// Ambil 5 percakapan terakhir agent+nomor ini sebagai memori (urutkan kronologis).
	var history []models.ChatHistory
	database.DB.Where("agent_id = ? AND sender = ?", agentID, sender.User).
		Order("created_at desc").Limit(5).Find(&history)
	for i, j := 0, len(history)-1; i < j; i, j = i+1, j-1 {
		history[i], history[j] = history[j], history[i]
	}

	reply, err := services.ChatWithKnowledge(agentID, prompt, tone, msg, history)
	if err != nil {
		log.Printf("AI error (agent %d) dari %s: %v", agentID, sender.User, err)
		reply = "Maaf, ada kendala teknis."
	}

	if err := services.WA(agentID).SendMessage(sender, reply); err != nil {
		log.Printf("Gagal kirim (agent %d) ke %s: %v", agentID, sender.User, err)
		return
	}

	database.DB.Create(&models.ChatHistory{
		AgentID: agentID,
		Sender:  sender.User,
		Message: msg,
		Reply:   reply,
	})
}

// OnDeviceLinked menyimpan device JID & nomor saat agent berhasil login via QR.
func OnDeviceLinked(agentID uint, jid, number string) {
	var a models.Agent
	if database.DB.First(&a, agentID).Error != nil {
		return
	}
	a.DeviceJID = jid
	a.Number = number
	database.DB.Save(&a)
	log.Printf("Agent %d ter-link ke nomor %s", agentID, number)
}

// StartAgents menyambungkan ulang semua agent yang sudah punya device saat startup.
func StartAgents() {
	var agents []models.Agent
	database.DB.Find(&agents)
	for i := range agents {
		a := agents[i]
		// Migrasi single-number lama: agent default (id 1) adopsi device yang sudah ter-link.
		if a.ID == 1 && a.DeviceJID == "" {
			if jid := services.FirstDeviceJID(); jid != "" {
				a.DeviceJID = jid
				if idx := strings.IndexAny(jid, ":@"); idx >= 0 {
					a.Number = jid[:idx]
				}
				database.DB.Save(&a)
			}
		}
		if a.DeviceJID != "" {
			go func(ag models.Agent) {
				status, err := services.WA(ag.ID).Connect(ag.DeviceJID)
				if err != nil {
					log.Printf("Agent %d gagal connect: %v", ag.ID, err)
					return
				}
				// Lengkapi cache nomor kalau belum ada.
				if status == "connected" && ag.Number == "" {
					if num, _ := services.WA(ag.ID).GetInfo(); num != "" {
						ag.Number = num
						database.DB.Save(&ag)
					}
				}
			}(a)
		}
	}
}

// ---- Agent CRUD ----

func ListAgents(c *gin.Context) {
	var agents []models.Agent
	database.DB.Order("id asc").Find(&agents)
	c.JSON(200, gin.H{"data": agents})
}

// AgentStatuses mengembalikan status koneksi live tiap agent: { "1": "connected", ... }.
// Dipakai dashboard untuk titik indikator hijau/kuning/merah tanpa menimpa form.
func AgentStatuses(c *gin.Context) {
	var agents []models.Agent
	database.DB.Order("id asc").Find(&agents)
	out := map[uint]string{}
	for _, a := range agents {
		out[a.ID] = services.WA(a.ID).GetStatus()
	}
	c.JSON(200, gin.H{"data": out})
}

func CreateAgent(c *gin.Context) {
	var req struct {
		Name         string `json:"name"`
		SystemPrompt string `json:"system_prompt"`
		Tone         string `json:"tone"`
	}
	c.ShouldBindJSON(&req)
	if req.Tone == "" {
		req.Tone = "ramah"
	}
	a := models.Agent{Name: req.Name, SystemPrompt: req.SystemPrompt, Tone: req.Tone}
	database.DB.Create(&a)
	c.JSON(201, gin.H{"data": a})
}

func UpdateAgent(c *gin.Context) {
	var a models.Agent
	if database.DB.First(&a, c.Param("id")).Error != nil {
		c.JSON(404, gin.H{"error": "Agent tidak ditemukan"})
		return
	}
	var req struct {
		Name         string `json:"name"`
		SystemPrompt string `json:"system_prompt"`
		Tone         string `json:"tone"`
	}
	c.ShouldBindJSON(&req)
	if req.Name != "" {
		a.Name = req.Name
	}
	a.SystemPrompt = req.SystemPrompt
	if req.Tone != "" {
		a.Tone = req.Tone
	}
	database.DB.Save(&a)
	c.JSON(200, gin.H{"data": a})
}

func DeleteAgent(c *gin.Context) {
	database.DB.Delete(&models.Agent{}, c.Param("id"))
	c.JSON(200, gin.H{"message": "Deleted"})
}
