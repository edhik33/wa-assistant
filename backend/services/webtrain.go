package services

import (
	"context"
	"encoding/json"
	"log"
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
Dari konten yang diberikan, ambil SEMUA informasi yang berguna untuk pelanggan: produk/layanan,
harga, promo, cara order, pembayaran, pengiriman/ongkir, jam operasional, lokasi, kontak, garansi,
kebijakan. BUANG menu navigasi, footer, copyright, teks hukum panjang, dan basa-basi marketing kosong.
Jangan mengarang—hanya dari teks yang diberikan. Tulis pertanyaan seperti cara pelanggan bertanya,
jawaban ringkas & faktual, bahasa Indonesia natural.
PENTING: Halaman produk/layanan yang memuat nama produk, HARGA, stok, atau cara pesan HAMPIR PASTI
punya info berguna—WAJIB diekstrak, jangan dilewati. Kembalikan array kosong [] HANYA bila konten
benar-benar cuma menu/navigasi tanpa satu pun fakta tentang produk, harga, layanan, atau kontak.
Output HANYA JSON array: [{"question":"...","answer":"..."}].`

// GenerateWebFAQ mengubah konten satu halaman web menjadi pasangan Q&A FAQ yang bersih.
// Mengembalikan slice kosong (bukan error) bila konten benar-benar tak mengandung info berguna.
// Mencoba hingga 2x karena model kadang flaky mengembalikan [] untuk konten yang sama.
func GenerateWebFAQ(title, content string) ([]QAPair, error) {
	content = strings.TrimSpace(content)
	if content == "" {
		return nil, nil
	}
	if r := []rune(content); len(r) > webFAQMaxInputRunes {
		content = string(r[:webFAQMaxInputRunes])
	}
	p := activePreset()
	userMsg := "Judul halaman: " + title + "\n\nKonten:\n" + content

	var lastErr error
	for attempt := 1; attempt <= 2; attempt++ {
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		resp, err := clientForPreset(p).CreateChatCompletion(ctx, openai.ChatCompletionRequest{
			Model: p.Model,
			Messages: []openai.ChatCompletionMessage{
				{Role: openai.ChatMessageRoleSystem, Content: webFAQSystem},
				{Role: openai.ChatMessageRoleUser, Content: userMsg},
			},
			MaxTokens:   2500, // beri ruang ekstra: model reasoning makan token utk "mikir" dulu
			Temperature: 0.2,
		})
		cancel()
		if err != nil {
			lastErr = err
			continue
		}
		lastErr = nil
		if len(resp.Choices) == 0 {
			continue
		}
		if qa := parseQAJSON(resp.Choices[0].Message.Content); len(qa) > 0 {
			return qa, nil
		}
		if attempt == 1 {
			log.Printf("[faq] percobaan 1 kosong untuk %q (%d char) — retry", title, len([]rune(content)))
		}
	}
	return nil, lastErr // (nil,nil) = benar-benar kosong; (nil,err) = gangguan API -> caller fallback chunk
}

const webPersonaSystem = `Kamu prompt engineer. Buat SYSTEM PROMPT persona SINGKAT untuk AI customer service
WhatsApp, berdasarkan konten website. Bahasa Indonesia, RINGKAS & UTUH — sekitar 6-10 kalimat,
MAKSIMAL ~1200 karakter, dan WAJIB selesaikan kalimat terakhir (jangan terpotong).
Cakup secara ringkas: (1) identitas — nama brand yang BENAR (bukan judul SEO panjang) & bidang usaha;
(2) JENIS produk/layanan secara umum (sebut kategorinya saja); (3) area/jam layanan & cara kontak bila ada;
(4) peran dan batasan layanan; (5) cara order; (6) hal yang TIDAK boleh dijanjikan (kirim
file/katalog/gambar lewat chat, atau harga/stok/detail yang tidak pasti).
PENTING: JANGAN menyalin daftar kode produk atau harga satu per satu. Detail itu sudah tersimpan di basis
pengetahuan dan diambil otomatis saat pelanggan bertanya — persona cukup menyebut kategori produk umum.
JANGAN menentukan tone, gaya bahasa, sapaan, atau penggunaan emoji karena semuanya diatur terpisah.
Jangan mengarang. Output HANYA teks persona, tanpa kalimat pembuka/penutup.`

// GenerateWebPersona menyusun system prompt persona dari beberapa cuplikan konten web (Home/About).
// Mencoba hingga 2x dan menyimpan hasil terlengkap, karena model kadang berhenti terlalu dini
// (persona terpotong di tengah, mis. berhenti tepat di sebuah heading).
func GenerateWebPersona(samples []string) (string, error) {
	joined := strings.TrimSpace(strings.Join(samples, "\n\n---\n\n"))
	if joined == "" {
		return "", nil
	}
	if r := []rune(joined); len(r) > webPersonaMaxInputRunes {
		joined = string(r[:webPersonaMaxInputRunes])
	}
	p := activePreset()
	userMsg := "Konten website:\n" + joined

	var best string
	var lastErr error
	for attempt := 1; attempt <= 2; attempt++ {
		ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
		resp, err := clientForPreset(p).CreateChatCompletion(ctx, openai.ChatCompletionRequest{
			Model: p.Model,
			Messages: []openai.ChatCompletionMessage{
				{Role: openai.ChatMessageRoleSystem, Content: webPersonaSystem},
				{Role: openai.ChatMessageRoleUser, Content: userMsg},
			},
			MaxTokens:   3000, // ruang lega: persona + token "mikir" model reasoning, agar tak kosong/terpotong
			Temperature: 0.4,
		})
		cancel()
		if err != nil {
			lastErr = err
			continue
		}
		lastErr = nil
		if len(resp.Choices) == 0 {
			continue
		}
		out := strings.TrimSpace(resp.Choices[0].Message.Content)
		fr := string(resp.Choices[0].FinishReason)
		if len([]rune(out)) > len([]rune(best)) {
			best = out // simpan yang terpanjang sebagai cadangan
		}
		// finish=length berarti kehabisan token (terpotong di tengah) -> jangan diterima, ulangi.
		if fr != "length" && personaLooksComplete(out) {
			return out, nil
		}
		log.Printf("[persona] belum lengkap (len=%d, finish=%s) — retry", len([]rune(out)), fr)
	}
	// Best-effort: kalau tetap terpotong, rapikan ke akhir kalimat utuh (jangan berhenti di tengah kata).
	return cleanTruncatedPersona(best), lastErr
}

// cleanTruncatedPersona memotong teks ke akhir kalimat terakhir bila persona tampak terpotong,
// supaya tidak pernah berhenti di tengah kata.
func cleanTruncatedPersona(s string) string {
	s = strings.TrimSpace(s)
	if s == "" || personaLooksComplete(s) {
		return s
	}
	if idx := strings.LastIndexAny(s, ".!?"); idx > 200 {
		return strings.TrimSpace(s[:idx+1])
	}
	return s
}

// personaLooksComplete menolak persona yang jelas terpotong (terlalu pendek atau berhenti di heading).
func personaLooksComplete(s string) bool {
	s = strings.TrimSpace(s)
	if len([]rune(s)) < 350 {
		return false
	}
	lines := strings.Split(s, "\n")
	last := strings.TrimSpace(lines[len(lines)-1])
	// Berhenti tepat di heading markdown ("## ...") atau label tanpa isi = terpotong.
	if strings.HasPrefix(last, "#") || strings.HasSuffix(last, ":") {
		return false
	}
	return true
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
