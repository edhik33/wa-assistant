package services

import (
	"strings"
	"testing"

	"wa-assistant/backend/models"
)

func TestToneInstructionOverridesPersonaStyle(t *testing.T) {
	for _, tone := range []string{"ramah", "formal", "santai", "persuasif"} {
		instruction := toneInstruction(tone)
		if !strings.Contains(instruction, "mengesampingkan gaya bahasa berbeda") {
			t.Errorf("tone %q harus menegaskan prioritas terhadap gaya di persona: %q", tone, instruction)
		}
	}

	if instruction := toneInstruction("custom"); instruction != "" {
		t.Errorf("tone custom harus mengikuti persona tanpa instruksi tambahan, dapat %q", instruction)
	}
}

func TestTokenizeQuery(t *testing.T) {
	got := tokenizeQuery("Berapa harga kaos ini ya kak?")
	// "ini", "kak" = stopword; "ya" < 3 huruf → tersaring. Sisanya kata bermakna.
	want := map[string]bool{"berapa": true, "harga": true, "kaos": true}
	if len(got) != len(want) {
		t.Fatalf("tokenizeQuery = %v, mau 3 token bermakna %v", got, want)
	}
	for _, w := range got {
		if !want[w] {
			t.Errorf("token tak terduga: %q (out=%v)", w, got)
		}
	}
	if tq := tokenizeQuery("ya kak di ke"); len(tq) != 0 {
		t.Errorf("query semua stopword/pendek harus kosong, dapat %v", tq)
	}
}

func TestKeywordSearch(t *testing.T) {
	items := []KBItem{
		{K: models.Knowledge{ID: 1, Question: "Berapa harga kaos polos?", Answer: "Harga kaos polos 75 ribu.", Tags: "harga,kaos"}},
		{K: models.Knowledge{ID: 2, Question: "Jam operasional?", Answer: "Buka jam 8 sampai 5.", Tags: "jam,operasional"}},
		{K: models.Knowledge{ID: 3, Question: "Cara pengiriman?", Answer: "Kirim via JNE.", Tags: "kirim,ongkir"}},
	}

	got := keywordSearch("harga kaos berapa", items)
	if len(got) == 0 || got[0].ID != 1 {
		t.Fatalf("harusnya knowledge #1 (harga kaos) peringkat teratas, dapat %+v", got)
	}

	// Tidak ada overlap kata bermakna → tidak mengembalikan apa-apa (bukan asal comot).
	if r := keywordSearch("apakah ini bagus", items); len(r) != 0 {
		t.Errorf("query tanpa overlap harus kosong, dapat %d item", len(r))
	}

	// Cocok tag persis tetap terdeteksi.
	if r := keywordSearch("mau tanya jam", items); len(r) == 0 || r[0].ID != 2 {
		t.Errorf("query 'jam' harusnya knowledge #2 teratas, dapat %+v", r)
	}
}

func TestBuildRetrievalQuery(t *testing.T) {
	hist := []models.ChatHistory{
		{Message: "Halo", Reply: "Halo kak, ada yang bisa dibantu?"},
		{Message: "Ada kaos warna apa aja?", Reply: "Ada merah, hitam, putih kak."},
	}

	tests := []struct {
		name    string
		msg     string
		history []models.ChatHistory
		want    string
	}{
		{
			name:    "pesan pendek digabung pesan customer sebelumnya",
			msg:     "yang merah berapa?",
			history: hist,
			want:    "Ada kaos warna apa aja? yang merah berapa?",
		},
		{
			name:    "pesan satu kata follow-up",
			msg:     "berapa?",
			history: hist,
			want:    "Ada kaos warna apa aja? berapa?",
		},
		{
			name:    "pesan panjang dipakai apa adanya",
			msg:     "Saya mau pesan kaos warna merah ukuran XL berapa harganya ya kak",
			history: hist,
			want:    "Saya mau pesan kaos warna merah ukuran XL berapa harganya ya kak",
		},
		{
			name:    "pesan pendek tanpa history tetap apa adanya",
			msg:     "berapa?",
			history: nil,
			want:    "berapa?",
		},
		{
			name:    "lebih dari 4 kata dipakai apa adanya",
			msg:     "apakah ini bisa dikirim besok",
			history: hist,
			want:    "apakah ini bisa dikirim besok",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := buildRetrievalQuery(tt.msg, tt.history); got != tt.want {
				t.Errorf("buildRetrievalQuery(%q) = %q, mau %q", tt.msg, got, tt.want)
			}
		})
	}
}
