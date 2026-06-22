package main

import (
	_ "embed"
	"encoding/json"
	"flag"
	"log"
	"os"

	"wa-assistant/backend/config"
	"wa-assistant/backend/database"
	"wa-assistant/backend/models"
	"wa-assistant/backend/services"
)

//go:embed knowledge.json
var embedded []byte

// Seeder knowledge base. Menyimpan pasangan Q&A ke tabel knowledge lalu
// menghitung embedding-nya. Aman dijalankan berulang (upsert by question).
//
//	go run ./backend/cmd/seedkb                       # pakai data bawaan (knowledge.json)
//	go run ./backend/cmd/seedkb -file data-lain.json  # pakai file JSON sendiri
func main() {
	file := flag.String("file", "", "path file JSON knowledge (kosong = pakai data bawaan)")
	agentFlag := flag.Uint("agent", 1, "id agent (CS) tujuan knowledge")
	flag.Parse()
	aid := *agentFlag

	config.Load()
	database.Init()
	services.InitEmbedding()

	raw := embedded
	if *file != "" {
		b, err := os.ReadFile(*file)
		if err != nil {
			log.Fatalf("Gagal baca %s: %v", *file, err)
		}
		raw = b
	}

	var items []struct {
		Question string `json:"question"`
		Answer   string `json:"answer"`
		Tags     string `json:"tags"`
	}
	if err := json.Unmarshal(raw, &items); err != nil {
		log.Fatalf("JSON tidak valid: %v", err)
	}

	var created, updated int
	for _, it := range items {
		if it.Question == "" {
			continue
		}
		var k models.Knowledge
		err := database.DB.Where("agent_id = ? AND question = ?", aid, it.Question).First(&k).Error
		if err == nil {
			// Sudah ada: perbarui isinya lalu re-embed.
			k.Answer = it.Answer
			k.Tags = it.Tags
			database.DB.Save(&k)
			services.IndexKnowledge(&k)
			updated++
		} else {
			k = models.Knowledge{AgentID: aid, Question: it.Question, Answer: it.Answer, Tags: it.Tags}
			database.DB.Create(&k)
			services.IndexKnowledge(&k)
			created++
		}
		log.Printf("OK: %s", it.Question)
	}

	if !services.EmbeddingEnabled() {
		log.Println("Catatan: embedding nonaktif (EMBEDDING_API_KEY kosong) — knowledge tetap tersimpan, pencarian pakai keyword.")
	}
	log.Printf("Selesai. %d dibuat, %d diperbarui, total %d entry.", created, updated, len(items))
}
