package services

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	openai "github.com/sashabaranov/go-openai"
)

// QAPair = satu pasangan tanya-jawab FAQ hasil olahan AI dari konten web.
type QAPair struct {
	Question string `json:"question"`
	Answer   string `json:"answer"`
}

const (
	webFAQMaxInputRunes     = 6000 // batas konten per halaman yang dikirim ke AI (kontrol token)
	webPersonaMaxInputRunes = 5000
)

const webFAQSystem = `Kamu ahli menyusun FAQ knowledge base customer service dari konten website bisnis.
Dari konten yang diberikan, ambil HANYA informasi yang berguna untuk pelanggan: produk/layanan,
harga, promo, cara order, pembayaran, pengiriman/ongkir, jam operasional, lokasi, kontak, garansi,
kebijakan. BUANG menu navigasi, footer, copyright, teks hukum panjang, dan basa-basi marketing kosong.
Jangan mengarang—hanya dari teks yang diberikan. Tulis pertanyaan seperti cara pelanggan bertanya,
jawaban ringkas & faktual, bahasa Indonesia natural.
Output HANYA JSON array: [{"question":"...","answer":"..."}]. Jika konten tidak punya info berguna
untuk pelanggan, kembalikan [].`

// GenerateWebFAQ mengubah konten satu halaman web menjadi pasangan Q&A FAQ yang bersih.
// Mengembalikan slice kosong (bukan error) bila konten tidak mengandung info berguna.
func GenerateWebFAQ(title, content string) ([]QAPair, error) {
	content = strings.TrimSpace(content)
	if content == "" {
		return nil, nil
	}
	if r := []rune(content); len(r) > webFAQMaxInputRunes {
		content = string(r[:webFAQMaxInputRunes])
	}
	p := activePreset()
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	resp, err := clientForPreset(p).CreateChatCompletion(ctx, openai.ChatCompletionRequest{
		Model: p.Model,
		Messages: []openai.ChatCompletionMessage{
			{Role: openai.ChatMessageRoleSystem, Content: webFAQSystem},
			{Role: openai.ChatMessageRoleUser, Content: "Judul halaman: " + title + "\n\nKonten:\n" + content},
		},
		MaxTokens:   1200,
		Temperature: 0.3,
	})
	if err != nil {
		return nil, err
	}
	if len(resp.Choices) == 0 {
		return nil, nil
	}
	return parseQAJSON(resp.Choices[0].Message.Content), nil
}

const webPersonaSystem = `Kamu prompt engineer. Buat SYSTEM PROMPT persona untuk AI customer service WhatsApp
sebuah bisnis, berdasarkan konten website mereka. Tulis dalam bahasa Indonesia. Utamakan AKURASI &
KELENGKAPAN — panjang tidak masalah, jangan dipotong, selesaikan setiap kalimat dengan utuh.
WAJIB mencakup: (1) identitas — nama bisnis yang BENAR (ambil nama brand-nya saja, bukan judul SEO
yang panjang) & bidang usahanya; (2) produk/layanan utama beserta keunggulan bila ada; (3) area/jam
layanan & kontak bila tercantum; (4) gaya bahasa ramah, sopan, menyapa "kak"; (5) cara order/checkout
bila ada di konten; (6) hal yang TIDAK boleh dijanjikan (mengirim file/katalog/gambar lewat chat, atau
harga/stok/detail yang tidak diketahui — arahkan ke admin/website untuk hal itu).
Jangan mengarang fakta yang tak ada di konten. Output HANYA teks persona, tanpa kalimat pembuka/penutup.`

// GenerateWebPersona menyusun system prompt persona dari beberapa cuplikan konten web (Home/About).
func GenerateWebPersona(samples []string) (string, error) {
	joined := strings.TrimSpace(strings.Join(samples, "\n\n---\n\n"))
	if joined == "" {
		return "", nil
	}
	if r := []rune(joined); len(r) > webPersonaMaxInputRunes {
		joined = string(r[:webPersonaMaxInputRunes])
	}
	p := activePreset()
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	resp, err := clientForPreset(p).CreateChatCompletion(ctx, openai.ChatCompletionRequest{
		Model: p.Model,
		Messages: []openai.ChatCompletionMessage{
			{Role: openai.ChatMessageRoleSystem, Content: webPersonaSystem},
			{Role: openai.ChatMessageRoleUser, Content: "Konten website:\n" + joined},
		},
		MaxTokens:   900, // ruang cukup agar persona lengkap tidak terpotong
		Temperature: 0.5,
	})
	if err != nil {
		return "", err
	}
	if len(resp.Choices) == 0 {
		return "", nil
	}
	return strings.TrimSpace(resp.Choices[0].Message.Content), nil
}

// parseQAJSON mengekstrak array JSON [{question,answer}] dari output AI (toleran markdown/teks ekstra).
func parseQAJSON(raw string) []QAPair {
	s := strings.TrimSpace(raw)
	s = strings.TrimPrefix(s, "```json")
	s = strings.TrimPrefix(s, "```")
	s = strings.TrimSuffix(s, "```")
	start := strings.Index(s, "[")
	end := strings.LastIndex(s, "]")
	if start == -1 || end == -1 || start >= end {
		return nil
	}
	var items []QAPair
	if json.Unmarshal([]byte(s[start:end+1]), &items) != nil {
		return nil
	}
	out := make([]QAPair, 0, len(items))
	for _, it := range items {
		q, a := strings.TrimSpace(it.Question), strings.TrimSpace(it.Answer)
		if q != "" && a != "" {
			out = append(out, QAPair{Question: q, Answer: a})
		}
	}
	return out
}
