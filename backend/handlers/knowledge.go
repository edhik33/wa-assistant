package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"wa-assistant/backend/config"
	"wa-assistant/backend/database"
	"wa-assistant/backend/models"
	"wa-assistant/backend/services"

	"github.com/gin-gonic/gin"
	openai "github.com/sashabaranov/go-openai"
)

type GenerateReq struct {
	Text  string `json:"text"`
	Count int    `json:"count"` // jumlah Q&A yang diinginkan (default 5)
}

// GenerateKnowledge generates Q&A pairs from raw text using AI
func GenerateKnowledge(c *gin.Context) {
	var req GenerateReq
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Text) == "" {
		c.JSON(400, gin.H{"error": "Text is required"})
		return
	}
	if req.Count <= 0 { req.Count = 5 }
	if req.Count > 10 { req.Count = 10 }

	prompt := `Buatkan ` + intToStr(req.Count) + ` pasangan Tanya-Jawab dalam format JSON dari teks berikut.
Gunakan bahasa Indonesia yang natural.
Format output HARUS JSON array persis seperti ini:
[{"question": "pertanyaan", "answer": "jawaban", "tags": "kata,kunci"}]

Teks sumber:
` + req.Text

	cfg := openai.DefaultConfig(config.EnvRequired("OPENAI_API_KEY"))
	cfg.BaseURL = config.Env("OPENAI_BASE_URL", "https://api.deepseek.com/v1")
	client := openai.NewClientWithConfig(cfg)

	resp, err := client.CreateChatCompletion(context.Background(), openai.ChatCompletionRequest{
		Model: config.Env("OPENAI_MODEL", "deepseek-v4-pro"),
		Messages: []openai.ChatCompletionMessage{
			{Role: openai.ChatMessageRoleSystem, Content: "Kamu adalah generator knowledge base. Output HANYA JSON array."},
			{Role: openai.ChatMessageRoleUser, Content: prompt},
		},
		MaxTokens: 1000,
	})
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	content := strings.TrimSpace(resp.Choices[0].Message.Content)
	// Clean markdown code block if any
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")

	var items []struct {
		Question string `json:"question"`
		Answer   string `json:"answer"`
		Tags     string `json:"tags"`
	}
	if err := json.Unmarshal([]byte(content), &items); err != nil {
		c.JSON(500, gin.H{"error": "Failed to parse AI response", "raw": content})
		return
	}

	aid, ok := resolveAgent(c)
	if !ok {
		return
	}
	var created []models.Knowledge
	for _, item := range items {
		k := models.Knowledge{AgentID: aid, Question: item.Question, Answer: item.Answer, Tags: item.Tags}
		_ = database.DB.Create(&k).Error
		services.IndexKnowledge(&k)
		created = append(created, k)
	}

	c.JSON(201, gin.H{"data": created})
}

func intToStr(n int) string {
	return fmt.Sprintf("%d", n)
}

// ImportKnowledge mengimpor banyak Q&A sekaligus (format JSON) ke knowledge agent,
// lalu menghitung embedding-nya. Upsert berdasarkan (agent_id, question).
func ImportKnowledge(c *gin.Context) {
	aid, ok := resolveAgent(c)
	if !ok {
		return
	}
	var req struct {
		Items []struct {
			Question string `json:"question"`
			Answer   string `json:"answer"`
			Tags     string `json:"tags"`
		} `json:"items"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "JSON tidak valid"})
		return
	}

	created, updated := 0, 0
	for _, it := range req.Items {
		if strings.TrimSpace(it.Question) == "" {
			continue
		}
		var k models.Knowledge
		if database.DB.Where("agent_id = ? AND question = ?", aid, it.Question).First(&k).Error == nil {
			k.Answer = it.Answer
			k.Tags = it.Tags
			_ = database.DB.Save(&k).Error
			services.IndexKnowledge(&k)
			updated++
		} else {
			k = models.Knowledge{AgentID: aid, Question: it.Question, Answer: it.Answer, Tags: it.Tags}
			_ = database.DB.Create(&k).Error
			services.IndexKnowledge(&k)
			created++
		}
	}
	c.JSON(200, gin.H{"created": created, "updated": updated})
}
