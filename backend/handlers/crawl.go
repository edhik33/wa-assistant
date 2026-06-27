package handlers

import (
	"log"
	"net/url"
	"strings"
	"time"

	"wa-assistant/backend/database"
	"wa-assistant/backend/models"
	"wa-assistant/backend/services"

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

// TrainCrawlPages memulai pelatihan halaman terpilih menjadi FAQ (background job).
// Tiap halaman diubah AI jadi Q&A bersih lalu di-embed. Status job -> "training"; UI polling.
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
	var job models.CrawlJob
	if database.DB.Where("agent_id = ?", aid).First(&job, c.Param("jobId")).Error != nil {
		c.JSON(404, gin.H{"error": "Job tidak ditemukan"})
		return
	}
	if job.Status == "training" {
		c.JSON(409, gin.H{"error": "Pelatihan sedang berjalan, tunggu sampai selesai"})
		return
	}
	maxChars, _ := crawlLimitsForTenant(currentTenantID(c))
	database.DB.Model(&job).Update("status", "training")
	go runWebTraining(aid, job.ID, req.PageIDs, maxChars)
	c.JSON(202, gin.H{"started": true})
}

// runWebTraining (background) mengubah tiap halaman terpilih menjadi FAQ Q&A via AI lalu menyimpannya
// sebagai knowledge. Hormati kuota karakter; halaman tanpa info berguna dilewati (bukan sampah masuk KB).
func runWebTraining(agentID, jobID uint, pageIDs []uint, maxChars int) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[train] PANIC agent %d: %v", agentID, r)
		}
		database.DB.Model(&models.CrawlJob{}).Where("id = ?", jobID).Update("status", "done")
	}()

	used := knowledgeCharsUsed(agentID)
	var pages []models.CrawlPage
	database.DB.Where("agent_id = ? AND job_id = ? AND id IN ?", agentID, jobID, pageIDs).Find(&pages)

	stopped := false
	for i := range pages {
		// Hormati permintaan Stop dari user: berhenti rapi antar-halaman.
		// Halaman yang sudah jadi FAQ tetap tersimpan; sisanya bisa dilatih lagi nanti.
		if jobStatusIs(jobID, "stopping") {
			log.Printf("[train] dihentikan user pada halaman %d/%d (agent %d)", i, len(pages), agentID)
			stopped = true
			break
		}
		p := pages[i]
		if p.Status == "trained" || strings.TrimSpace(p.Content) == "" {
			continue
		}
		if used >= int64(maxChars) {
			setPageStatus(p.ID, "failed", "kuota knowledge penuh")
			continue
		}
		setPageStatus(p.ID, "training", "")

		faqs, err := services.GenerateWebFAQ(p.Title, p.Content)
		if err != nil {
			// AI gagal -> fallback potongan bersih supaya konten tidak hilang.
			log.Printf("[train] FAQ gagal page %d (%s): %v -> fallback chunk", p.ID, p.URL, err)
			faqs = fallbackChunks(p.Title, p.Content)
		}
		if len(faqs) == 0 {
			setPageStatus(p.ID, "skipped", "tidak ada info berguna untuk pelanggan")
			continue
		}

		added := 0
		for _, f := range faqs {
			ans := strings.TrimSpace(f.Answer)
			if ans == "" {
				continue
			}
			if used+int64(len([]rune(ans))) > int64(maxChars) {
				break // kuota habis
			}
			k := models.Knowledge{AgentID: agentID, Question: f.Question, Answer: ans, Tags: "web", Source: "web", SourceURL: p.URL}
			database.DB.Create(&k) // CharCount diisi otomatis oleh hook BeforeSave
			services.IndexKnowledge(&k)
			used += int64(len([]rune(ans)))
			added++
		}
		now := time.Now()
		st := "trained"
		errMsg := ""
		if added == 0 {
			st, errMsg = "failed", "kuota knowledge penuh"
		}
		database.DB.Model(&models.CrawlPage{}).Where("id = ?", p.ID).
			Updates(map[string]any{"status": st, "error": errMsg, "trained_at": &now})
	}
	services.InvalidateKB(agentID)
	// Persona otomatis hanya bila pelatihan tuntas (kalau di-Stop, jangan boros panggil AI lagi).
	if !stopped {
		maybeAutoPersona(agentID, jobID)
	}
}

func setPageStatus(pageID uint, status, errMsg string) {
	database.DB.Model(&models.CrawlPage{}).Where("id = ?", pageID).
		Updates(map[string]any{"status": status, "error": errMsg})
}

// jobStatusIs membaca status job terkini dari DB (dipakai untuk mendeteksi permintaan Stop saat training).
func jobStatusIs(jobID uint, status string) bool {
	var s string
	database.DB.Model(&models.CrawlJob{}).Where("id = ?", jobID).Select("status").Scan(&s)
	return s == status
}

// StopTraining menandai job pelatihan agar berhenti rapi pada halaman berikutnya.
func StopTraining(c *gin.Context) {
	aid, ok := resolveAgent(c)
	if !ok {
		return
	}
	var job models.CrawlJob
	if database.DB.Where("agent_id = ?", aid).First(&job, c.Param("jobId")).Error != nil {
		c.JSON(404, gin.H{"error": "Job tidak ditemukan"})
		return
	}
	if job.Status != "training" {
		c.JSON(409, gin.H{"error": "Tidak ada pelatihan yang sedang berjalan"})
		return
	}
	database.DB.Model(&job).Update("status", "stopping")
	c.JSON(200, gin.H{"stopping": true})
}

// fallbackChunks dipakai bila AI FAQ gagal: simpan konten bersih sebagai beberapa potongan.
func fallbackChunks(title, content string) []services.QAPair {
	var out []services.QAPair
	for _, ch := range services.ChunkText(content) {
		out = append(out, services.QAPair{Question: "Informasi: " + title, Answer: ch})
	}
	return out
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

// maybeAutoPersona membuat persona otomatis dari konten web HANYA bila agent belum punya system prompt.
func maybeAutoPersona(agentID, jobID uint) {
	var agent models.Agent
	if database.DB.First(&agent, agentID).Error != nil {
		return
	}
	if strings.TrimSpace(agent.SystemPrompt) != "" {
		log.Printf("[persona] agent %d sudah punya persona, lewati auto-generate", agentID)
		return
	}
	persona := buildPersonaFromJob(agentID, jobID)
	if persona == "" {
		return
	}
	database.DB.Model(&agent).Update("system_prompt", persona)
	log.Printf("[persona] auto-generate untuk agent %d (%d karakter)", agentID, len([]rune(persona)))
}

// RegeneratePersona membuat ulang persona dari job crawl terakhir (dipicu manual oleh user dari UI).
func RegeneratePersona(c *gin.Context) {
	aid, ok := resolveAgent(c)
	if !ok {
		return
	}
	var job models.CrawlJob
	if database.DB.Where("agent_id = ?", aid).Order("id desc").First(&job).Error != nil {
		c.JSON(400, gin.H{"error": "Belum ada data website. Latih dari website dulu."})
		return
	}
	persona := buildPersonaFromJob(aid, job.ID)
	if persona == "" {
		c.JSON(502, gin.H{"error": "Gagal membuat persona dari konten web. Coba lagi."})
		return
	}
	database.DB.Model(&models.Agent{}).Where("id = ?", aid).Update("system_prompt", persona)
	c.JSON(200, gin.H{"system_prompt": persona})
}

// buildPersonaFromJob menyusun persona dari halaman terkaya pada satu job (prioritas Home/About).
func buildPersonaFromJob(agentID, jobID uint) string {
	var pages []models.CrawlPage
	database.DB.Where("agent_id = ? AND job_id = ? AND char_count >= ?", agentID, jobID, 100).
		Order("char_count desc").Find(&pages)
	if len(pages) == 0 {
		return ""
	}
	persona, err := services.GenerateWebPersona(pickPersonaSamples(pages))
	if err != nil {
		log.Printf("[persona] gagal generate agent %d: %v", agentID, err)
		return ""
	}
	return persona
}

// pickPersonaSamples memilih maksimal 3 cuplikan konten paling relevan untuk persona (Home/About dulu).
func pickPersonaSamples(pages []models.CrawlPage) []string {
	var home, about, rest []models.CrawlPage
	for _, p := range pages {
		lu := strings.ToLower(p.URL)
		switch {
		case isHomeURL(p.URL):
			home = append(home, p)
		case strings.Contains(lu, "about") || strings.Contains(lu, "tentang") ||
			strings.Contains(lu, "profil") || strings.Contains(lu, "company") ||
			strings.Contains(lu, "perusahaan"):
			about = append(about, p)
		default:
			rest = append(rest, p)
		}
	}
	ordered := append(append(home, about...), rest...)

	var samples []string
	for _, p := range ordered {
		if len(samples) >= 3 {
			break
		}
		c := p.Content
		if len([]rune(c)) > 1500 {
			c = string([]rune(c)[:1500])
		}
		if strings.TrimSpace(c) != "" {
			samples = append(samples, p.Title+"\n"+c)
		}
	}
	return samples
}

// isHomeURL true bila URL menunjuk ke halaman beranda (tanpa path atau hanya "/").
func isHomeURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	return u.Path == "" || u.Path == "/"
}
