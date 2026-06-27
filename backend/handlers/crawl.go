package handlers

import (
	"context"
	"fmt"
	"log"
	"net/url"
	"strings"
	"time"

	"wa-assistant/backend/config"
	"wa-assistant/backend/database"
	"wa-assistant/backend/models"
	"wa-assistant/backend/services"

	openai "github.com/sashabaranov/go-openai"

	"github.com/gin-gonic/gin"
)

// crawlLimitsForTenant mengembalikan (maxKnowledgeChars, maxCrawlPages) efektif untuk tenant.
// Default aman (setara Starter) dipakai bila tenant trial/tanpa plan atau plan belum di-set.
func crawlLimitsForTenant(tenantID uint) (maxChars, maxPages int) {
	maxChars, maxPages = 200000, 50
	var t models.Tenant
	if database.DB.Preload("Plan").First(&t, tenantID).Error == nil && t.Plan != nil {
		if t.Plan.MaxKnowledgeChars > 0 {
			maxChars = t.Plan.MaxKnowledgeChars
		}
		if t.Plan.MaxCrawlPages > 0 {
			maxPages = t.Plan.MaxCrawlPages
		}
	}
	return
}

func knowledgeCharsUsed(agentID uint) int64 {
	var used int64
	database.DB.Model(&models.Knowledge{}).Where("agent_id = ?", agentID).
		Select("COALESCE(SUM(char_count),0)").Scan(&used)
	return used
}

// StartCrawl memulai crawl website untuk satu agent (nomor) sebagai background job.
func StartCrawl(c *gin.Context) {
	aid, ok := resolveAgent(c)
	if !ok {
		return
	}
	var req struct {
		URL string `json:"url"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.URL) == "" {
		c.JSON(400, gin.H{"error": "URL website wajib diisi"})
		return
	}
	raw := strings.TrimSpace(req.URL)
	if !strings.HasPrefix(raw, "http://") && !strings.HasPrefix(raw, "https://") {
		raw = "https://" + raw
	}
	if u, err := url.Parse(raw); err != nil || u.Host == "" {
		c.JSON(400, gin.H{"error": "URL tidak valid"})
		return
	}

	// Cegah crawl ganda yang masih berjalan untuk nomor yang sama.
	var running int64
	database.DB.Model(&models.CrawlJob{}).
		Where("agent_id = ? AND status IN ?", aid, []string{"pending", "crawling"}).Count(&running)
	if running > 0 {
		c.JSON(409, gin.H{"error": "Masih ada crawl berjalan untuk nomor ini. Tunggu sampai selesai."})
		return
	}

	_, maxPages := crawlLimitsForTenant(currentTenantID(c))
	job := models.CrawlJob{AgentID: aid, RootURL: raw, Status: "pending"}
	if err := database.DB.Create(&job).Error; err != nil {
		c.JSON(500, gin.H{"error": "Gagal membuat job crawl"})
		return
	}
	go services.RunCrawl(job.ID, maxPages)
	c.JSON(201, gin.H{"data": job, "max_pages": maxPages})
}

// CrawlStatus mengembalikan satu job + daftar halamannya (untuk polling UI).
func CrawlStatus(c *gin.Context) {
	aid, ok := resolveAgent(c)
	if !ok {
		return
	}
	var job models.CrawlJob
	if database.DB.Where("agent_id = ?", aid).First(&job, c.Param("jobId")).Error != nil {
		c.JSON(404, gin.H{"error": "Job tidak ditemukan"})
		return
	}
	c.JSON(200, gin.H{"job": job, "pages": crawlPagesOf(job.ID)})
}

// LatestCrawl mengembalikan job crawl terakhir agent (agar UI bisa lanjut polling setelah refresh).
func LatestCrawl(c *gin.Context) {
	aid, ok := resolveAgent(c)
	if !ok {
		return
	}
	var job models.CrawlJob
	if database.DB.Where("agent_id = ?", aid).Order("id desc").First(&job).Error != nil {
		c.JSON(200, gin.H{"job": nil})
		return
	}
	c.JSON(200, gin.H{"job": job, "pages": crawlPagesOf(job.ID)})
}

func crawlPagesOf(jobID uint) []models.CrawlPage {
	var pages []models.CrawlPage
	database.DB.Where("job_id = ?", jobID).Order("id asc").Find(&pages)
	return pages
}

// TrainCrawlPages melatih (chunk + embed) halaman terpilih menjadi knowledge agent (source=web),
// dengan menghormati kuota karakter knowledge per paket.
func TrainCrawlPages(c *gin.Context) {
	aid, ok := resolveAgent(c)
	if !ok {
		return
	}
	var req struct {
		PageIDs []uint `json:"page_ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || len(req.PageIDs) == 0 {
		c.JSON(400, gin.H{"error": "Pilih minimal satu halaman"})
		return
	}

	maxChars, _ := crawlLimitsForTenant(currentTenantID(c))
	used := knowledgeCharsUsed(aid)

	var pages []models.CrawlPage
	database.DB.Where("agent_id = ? AND id IN ?", aid, req.PageIDs).Find(&pages)

	trained, chunks, skipped := 0, 0, 0
	quotaHit := false
	for i := range pages {
		p := pages[i]
		if p.Status == "trained" || strings.TrimSpace(p.Content) == "" {
			skipped++
			continue
		}
		chunkList := services.ChunkText(p.Content)
		pageChars := 0
		for _, ch := range chunkList {
			pageChars += len([]rune(ch))
		}
		if used+int64(pageChars) > int64(maxChars) {
			quotaHit = true
			break
		}
		for _, ch := range chunkList {
			k := models.Knowledge{
				AgentID: aid, Question: fmt.Sprintf("Informasi dari artikel: %s", p.Title), Answer: ch,
				Tags: "web", Source: "web", SourceURL: p.URL,
			}
			database.DB.Create(&k) // CharCount diisi otomatis oleh hook BeforeSave
			services.IndexKnowledge(&k)
			chunks++
		}
		now := time.Now()
		database.DB.Model(&models.CrawlPage{}).Where("id = ?", p.ID).
			Updates(map[string]any{"status": "trained", "trained_at": &now})
		used += int64(pageChars)
		trained++
	}
	services.InvalidateKB(aid)

	// Auto-generate Persona dari konten web kalau agent belum punya system prompt
	if len(req.PageIDs) > 0 {
		log.Printf("[autoPersona] triggering for agent %d, ids=%v", aid, req.PageIDs)
		autoGeneratePersona(aid, pages)
	}

	c.JSON(200, gin.H{
		"trained": trained, "chunks": chunks, "skipped": skipped,
		"quota_exceeded": quotaHit, "used_chars": used, "max_chars": maxChars,
	})
}

// KnowledgeUsage menampilkan pemakaian kuota knowledge agent (untuk UI).
func KnowledgeUsage(c *gin.Context) {
	aid, ok := resolveAgent(c)
	if !ok {
		return
	}
	maxChars, maxPages := crawlLimitsForTenant(currentTenantID(c))
	var total int64
	database.DB.Model(&models.Knowledge{}).Where("agent_id = ?", aid).Count(&total)
	c.JSON(200, gin.H{
		"used_chars": knowledgeCharsUsed(aid), "max_chars": maxChars,
		"max_pages": maxPages, "total_knowledge": total,
	})
}

// DeleteWebKnowledge menghapus knowledge bersumber web milik agent (opsional filter ?url=...).
func DeleteWebKnowledge(c *gin.Context) {
	aid, ok := resolveAgent(c)
	if !ok {
		return
	}
	q := database.DB.Where("agent_id = ? AND source = ?", aid, "web")
	if u := strings.TrimSpace(c.Query("url")); u != "" {
		q = q.Where("source_url LIKE ?", "%"+u+"%")
	}
	res := q.Delete(&models.Knowledge{})
	services.InvalidateKB(aid)
	c.JSON(200, gin.H{"deleted": res.RowsAffected})
}

// autoGeneratePersona generates a system prompt persona from trained crawl pages
// using AI, then saves it to the agent if the agent's system prompt is empty.
func autoGeneratePersona(agentID uint, pages []models.CrawlPage) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[autoPersona] PANIC agent %d: %v", agentID, r)
		}
	}()
	log.Printf("[autoPersona] start agent %d, pages=%d", agentID, len(pages))
	var agent models.Agent
	if database.DB.First(&agent, agentID).Error != nil {
		return
	}
	// Only generate if persona is empty
	if strings.TrimSpace(agent.SystemPrompt) != "" {
		log.Printf("[autoPersona] agent %d already has persona, skip", agentID)
		return
	}

	// Collect sample content from trained pages (max 3000 chars)
	var sample strings.Builder
	for _, p := range pages {
		if strings.TrimSpace(p.Content) == "" {
			log.Printf("[autoPersona] page %d (%s) empty content, skip", p.ID, p.Title)
			continue
		}
		log.Printf("[autoPersona] using page %d (%s), content len=%d", p.ID, p.Title, len([]rune(p.Content)))
		sample.WriteString(p.Title)
		sample.WriteString("\n")
		content := p.Content
		if len([]rune(content)) > 1500 {
			content = string([]rune(content)[:1500])
		}
		sample.WriteString(content)
		sample.WriteString("\n\n")
		if sample.Len() > 3000 {
			break
		}
	}

	if sample.Len() == 0 {
		log.Printf("[autoPersona] agent %d: zero sample content, skip", agentID)
		return
	}

	log.Printf("[autoPersona] agent %d: sample=%d chars, calling AI (model=%s)...", agentID, sample.Len(), config.Env("OPENAI_MODEL", "deepseek-v4-pro"))

	// Call AI to generate persona
	client := services.AIClient
	if client == nil {
		log.Printf("[autoPersona] AI client nil, skip agent %d", agentID)
		return
	}

	prompt := fmt.Sprintf(`Berdasarkan konten website berikut, buat persona customer service WhatsApp yang singkat dan natural. 
Tulis dalam Bahasa Indonesia, 3-5 kalimat saja. 
Format: "Kamu adalah [nama bisnis]. [deskripsi singkat]. [produk/layanan utama]. [cara order/kontak]."

Konten website:
%s`, sample.String()[:min(3000, sample.Len())])

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	resp, err := client.CreateChatCompletion(
		ctx,
		openai.ChatCompletionRequest{
			Model: config.Env("OPENAI_MODEL", "deepseek-v4-pro"),
			Messages: []openai.ChatCompletionMessage{
				{Role: "system", Content: "Kamu adalah generator persona CS. Output HANYA teks persona, tanpa kata pembuka/penutup."},
				{Role: "user", Content: prompt},
			},
			MaxTokens: 300,
		},
	)
	if err != nil {
		log.Printf("[autoPersona] AI error agent %d: %v", agentID, err)
		return
	}
	if len(resp.Choices) == 0 {
		log.Printf("[autoPersona] agent %d: AI returned 0 choices", agentID)
		return
	}

	persona := strings.TrimSpace(resp.Choices[0].Message.Content)
	if persona == "" {
		log.Printf("[autoPersona] agent %d: AI returned empty persona, raw=%q", agentID, resp.Choices[0].Message.Content)
		return
	}

	database.DB.Model(&agent).Update("system_prompt", persona)
	log.Printf("[autoPersona] Generated persona for agent %d (%d chars): %q", agentID, len(persona), persona[:min(80, len(persona))])
}
