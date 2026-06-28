package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"
	"wa-assistant/backend/config"
	"wa-assistant/backend/database"
	"wa-assistant/backend/models"
	"wa-assistant/backend/services"

	"github.com/gin-gonic/gin"
	openai "github.com/sashabaranov/go-openai"
)

type GenerateReq struct {
	Text    string `json:"text"`
	Count   int    `json:"count"`
	BizType string `json:"biz_type"` // "produk_fisik", "produk_digital", "jasa", "" = generik
}

var bizPrompts = map[string]string{
	"produk_fisik":   "pelanggan yang ingin tahu harga, spesifikasi, bahan, ukuran, cara order, pengiriman, garansi, dan pembayaran produk fisik",
	"produk_digital": "pelanggan yang ingin tahu harga, format file, cara akses/download, lisensi, kompatibilitas, fitur, dan cara pembelian produk digital",
	"jasa":           "pelanggan yang ingin tahu harga, durasi, proses, syarat, output, revisi, dan cara booking jasa/layanan",
}

// GenerateKnowledge generates Q&A pairs from raw text using AI
func GenerateKnowledge(c *gin.Context) {
	var req GenerateReq
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Text) == "" {
		c.JSON(400, gin.H{"error": "Text is required"})
		return
	}
	if req.Count <= 0 {
		req.Count = 10
	}
	if req.Count > 20 {
		req.Count = 20
	}

	// Alat AI generatif ini memakai token sungguhan — kenakan ke kuota AI bulanan
	// tenant agar tidak jadi kebocoran biaya di luar hitungan paket.
	tid := currentTenantID(c)
	if aiQuotaExceeded(tid) {
		c.JSON(429, gin.H{"error": "Kuota AI bulan ini sudah habis. Upgrade paket untuk lanjut."})
		return
	}

	bizCtx := bizPrompts[req.BizType]
	if bizCtx == "" {
		bizCtx = "pelanggan yang ingin tahu informasi penting tentang produk/layanan"
	}

	prompt := `Buatkan ` + intToStr(req.Count) + ` pasangan Tanya-Jawab FAQ dalam format JSON dari teks berikut.
Fokus pada pertanyaan yang sering ditanyakan ` + bizCtx + `.
Gunakan bahasa Indonesia yang natural dan ramah, seolah kamu customer service yang membantu.
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
			{Role: openai.ChatMessageRoleSystem, Content: "Kamu adalah AI yang jago membuat FAQ knowledge base untuk bisnis. Pahami konteks bisnisnya, buat pertanyaan yang realistis dari sudut pandang pelanggan. Output HANYA JSON array."},
			{Role: openai.ChatMessageRoleUser, Content: prompt},
		},
		MaxTokens: 1000,
	})
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	incrementAIUsage(tid)

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

// SetupWizardReq = input profil bisnis dari user.
type SetupWizardReq struct {
	BizName    string `json:"biz_name"`
	BizType    string `json:"biz_type"`
	Products   string `json:"products"`
	PriceRange string `json:"price_range"`
	OrderFlow  string `json:"order_flow"`
	Shipping   string `json:"shipping"`
	Hours      string `json:"hours"`
	CSName     string `json:"cs_name"`
}

// extractJSONArray — robust extraction: cari '[' pertama dan ']' terakhir, lalu unmarshal.
func extractJSONArray(raw string) ([]struct {
	Question string `json:"question"`
	Answer   string `json:"answer"`
	Tags     string `json:"tags"`
}, error) {
	content := strings.TrimSpace(raw)
	// Hapus markdown wrapper
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	content = strings.TrimSpace(content)

	// Cari [ pertama dan ] terakhir — handle extra text sebelum/sesudah array
	start := strings.Index(content, "[")
	end := strings.LastIndex(content, "]")
	if start == -1 || end == -1 || start >= end {
		return nil, fmt.Errorf("tidak menemukan JSON array dalam response")
	}
	content = content[start : end+1]

	var items []struct {
		Question string `json:"question"`
		Answer   string `json:"answer"`
		Tags     string `json:"tags"`
	}
	if err := json.Unmarshal([]byte(content), &items); err != nil {
		return nil, fmt.Errorf("gagal parse JSON: %w", err)
	}
	return items, nil
}

// buildFallbackFAQ — generate FAQ dari template kalau AI gagal total.
func buildFallbackFAQ(req SetupWizardReq) []struct {
	Question string `json:"question"`
	Answer   string `json:"answer"`
	Tags     string `json:"tags"`
} {
	items := []struct {
		Question string `json:"question"`
		Answer   string `json:"answer"`
		Tags     string `json:"tags"`
	}{
		{Question: "Halo, ini benar " + req.BizName + "?", Answer: "Halo kak! Benar, ini " + req.BizName + ". Ada yang bisa kami bantu?", Tags: "sapaan"},
		{Question: "Produk apa aja yang tersedia?", Answer: "Kami menyediakan " + req.Products + ". Info lengkap bisa ditanyakan ya kak.", Tags: "produk"},
		{Question: "Berapa harganya?", Answer: "Harga produk kami " + req.PriceRange + ". Untuk detail harga per produk bisa ditanyakan langsung ya kak.", Tags: "harga"},
		{Question: "Gimana cara ordernya?", Answer: "Cara ordernya gampang kak: " + req.OrderFlow, Tags: "order"},
		{Question: "Pengiriman pakai apa dan berapa lama?", Answer: "Kami kirim via " + req.Shipping + ". Estimasi sampai tergantung lokasi kak.", Tags: "pengiriman"},
		{Question: "Jam operasionalnya jam berapa?", Answer: "Kami beroperasi setiap hari jam " + req.Hours + " ya kak.", Tags: "jam"},
		{Question: "Bisa bayar pakai apa aja?", Answer: "Bisa transfer bank ya kak. Nanti kami infokan nomor rekeningnya setelah order.", Tags: "pembayaran"},
		{Question: "Ada garansinya nggak?", Answer: "Garansi tergantung produk ya kak. Bisa ditanyakan detailnya ke admin kami.", Tags: "garansi"},
		{Question: "Mau tanya-tanya dulu boleh?", Answer: "Boleh banget kak! Silakan tanya apa aja yang mau diketahui.", Tags: "bantuan"},
		{Question: "Bisa COD nggak?", Answer: "Untuk COD kami belum tersedia kak, masih transfer dulu ya.", Tags: "pembayaran"},
	}
	// Filter yang relevan — kalau field kosong, skip item yg bergantung field itu
	var filtered []struct {
		Question string `json:"question"`
		Answer   string `json:"answer"`
		Tags     string `json:"tags"`
	}
	for _, item := range items {
		if item.Tags == "produk" && req.Products == "" {
			continue
		}
		if item.Tags == "harga" && req.PriceRange == "" {
			continue
		}
		if item.Tags == "order" && req.OrderFlow == "" {
			continue
		}
		if item.Tags == "pengiriman" && req.Shipping == "" {
			continue
		}
		filtered = append(filtered, item)
	}
	return filtered
}

// tryGenerateFAQ — panggil AI untuk generate FAQ, dengan retry.
func tryGenerateFAQ(client *openai.Client, req SetupWizardReq) ([]struct {
	Question string `json:"question"`
	Answer   string `json:"answer"`
	Tags     string `json:"tags"`
}, error) {
	kbPrompt := fmt.Sprintf(`Buatkan 15 pasangan Tanya-Jawab FAQ knowledge base dari profil bisnis berikut.
Gunakan bahasa Indonesia natural dan ramah.
Fokus pada pertanyaan yang sering ditanyakan pelanggan.
Format output HARUS JSON array, tanpa teks lain: [{"question": "...", "answer": "...", "tags": "kata,kunci"}]

Profil bisnis:
Nama: %s | Produk: %s | Harga: %s | Order: %s | Kirim: %s | Jam: %s`, req.BizName, req.Products, req.PriceRange, req.OrderFlow, req.Shipping, req.Hours)

	maxRetries := 3
	var lastErr error
	for attempt := 0; attempt < maxRetries; attempt++ {
		if attempt > 0 {
			time.Sleep(time.Duration(attempt) * time.Second) // backoff: 1s, 2s
			log.Printf("[SetupWizard] Retry %d/%d untuk agent %d", attempt+1, maxRetries, 0)
		}

		resp, err := client.CreateChatCompletion(context.Background(), openai.ChatCompletionRequest{
			Model: config.Env("OPENAI_MODEL", "deepseek-v4-pro"),
			Messages: []openai.ChatCompletionMessage{
				{Role: openai.ChatMessageRoleSystem, Content: "Kamu adalah generator knowledge base FAQ. Output HANYA JSON array. JANGAN sertakan teks apapun selain JSON."},
				{Role: openai.ChatMessageRoleUser, Content: kbPrompt},
			},
			MaxTokens: 6000,
		})
		if err != nil {
			lastErr = fmt.Errorf("API error: %w", err)
			log.Printf("[SetupWizard] API call gagal attempt %d: %v", attempt+1, err)
			continue
		}

		if len(resp.Choices) == 0 {
			lastErr = fmt.Errorf("AI tidak mengembalikan response")
			log.Printf("[SetupWizard] Empty response attempt %d", attempt+1)
			continue
		}

		raw := resp.Choices[0].Message.Content
		items, err := extractJSONArray(raw)
		if err != nil {
			lastErr = fmt.Errorf("parse error: %w", err)
			log.Printf("[SetupWizard] JSON parse gagal attempt %d: %v\nRaw: %s", attempt+1, err, raw)
			continue
		}

		if len(items) == 0 {
			lastErr = fmt.Errorf("AI mengembalikan array kosong")
			continue
		}

		return items, nil
	}

	return nil, lastErr
}

// SetupWizard — satu form profil bisnis, auto-generate System Prompt + Knowledge.
func SetupWizard(c *gin.Context) {
	aid, ok := resolveAgent(c)
	if !ok {
		return
	}
	var req SetupWizardReq
	if err := c.ShouldBindJSON(&req); err != nil || req.BizName == "" {
		c.JSON(400, gin.H{"error": "Nama bisnis wajib diisi"})
		return
	}

	cfg := openai.DefaultConfig(config.EnvRequired("OPENAI_API_KEY"))
	cfg.BaseURL = config.Env("OPENAI_BASE_URL", "https://api.deepseek.com/v1")
	client := openai.NewClientWithConfig(cfg)

	// 1. Generate System Prompt
	sysPrompt := buildWizardSystemPrompt(req)
	resp1, err := client.CreateChatCompletion(context.Background(), openai.ChatCompletionRequest{
		Model: config.Env("OPENAI_MODEL", "deepseek-v4-pro"),
		Messages: []openai.ChatCompletionMessage{
			{Role: openai.ChatMessageRoleSystem, Content: "Kamu adalah prompt engineer. Buat persona AI customer service WhatsApp dalam bahasa Indonesia. Fokus pada peran, tugas, batasan, dan alur layanan. Jangan menentukan tone atau gaya bahasa karena diatur terpisah. Maks 6 kalimat."},
			{Role: openai.ChatMessageRoleUser, Content: sysPrompt},
		},
		MaxTokens: 500,
	})
	systemPrompt := ""
	if err == nil && len(resp1.Choices) > 0 {
		systemPrompt = strings.TrimSpace(resp1.Choices[0].Message.Content)
	}
	// Fallback: kalau AI gagal, build dari form langsung
	if systemPrompt == "" {
		systemPrompt = fmt.Sprintf("Kamu adalah %s, CS %s. Kami menjual %s. Harga %s. Cara order: %s. Pengiriman: %s. Jam operasional: %s. Saat customer mau beli, bantu memilih produk lalu kumpulkan nama, produk, alamat, dan metode bayar yang belum diberikan.", req.CSName, req.BizName, req.Products, req.PriceRange, req.OrderFlow, req.Shipping, req.Hours)
	}
	if systemPrompt != "" {
		database.DB.Model(&models.Agent{}).Where("id = ?", aid).
			Update("system_prompt", systemPrompt)
	}

	// 2. Generate Knowledge FAQ — dengan retry + fallback
	items, err := tryGenerateFAQ(client, req)
	if err != nil {
		log.Printf("[SetupWizard] AI FAQ gagal setelah retry, pakai fallback. Error: %v", err)
		items = buildFallbackFAQ(req)
	}

	// Hapus knowledge lama (mode replace, bukan append).
	database.DB.Where("agent_id = ?", aid).Delete(&models.Knowledge{})

	var created int
	for _, item := range items {
		k := models.Knowledge{AgentID: aid, Question: item.Question, Answer: item.Answer, Tags: item.Tags}
		database.DB.Create(&k)
		created++
	}

	// Batch invalidation: embed & invalidate cache setelah semua knowledge dibuat.
	for _, item := range items {
		var k models.Knowledge
		if database.DB.Where("agent_id = ? AND question = ?", aid, item.Question).First(&k).Error == nil {
			services.IndexKnowledge(&k)
		}
	}
	services.InvalidateKB(aid)

	// Reset ringkasan percakapan semua kontak — bisnis udah ganti, konteks lama gak relevan.
	database.DB.Where("agent_id = ?", aid).Delete(&models.ConversationMemory{})

	c.JSON(200, gin.H{
		"message":       "Setup selesai! Knowledge lama dihapus & diganti.",
		"system_prompt": systemPrompt,
		"knowledge":     created,
	})
}

func buildWizardSystemPrompt(req SetupWizardReq) string {
	return fmt.Sprintf(`Buat persona AI customer service WhatsApp untuk bisnis ini:
Nama Bisnis: %s
Jenis: %s
Produk: %s
Range Harga: %s
Cara Order: %s
Pengiriman: %s
Jam Operasional: %s
Nama CS: %s

Buat persona singkat (maks 6 kalimat) yang mencakup: siapa AI ini, produk yang dijual, cara order, batasan layanan, dan aturan closing. Jangan menentukan tone atau gaya bahasa karena diatur terpisah. Saat closing, kumpulkan nama, produk, alamat, dan metode bayar yang belum diberikan; jangan meminta nomor WhatsApp karena sudah diketahui dari chat.`, req.BizName, req.BizType, req.Products, req.PriceRange, req.OrderFlow, req.Shipping, req.Hours, req.CSName)
}
