package services

import (
	"testing"

	"wa-assistant/backend/models"
)

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
