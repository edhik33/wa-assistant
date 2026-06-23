package models

import "time"

// ScheduledMessage = broadcast/pesan yang dijadwalkan untuk dikirim pada waktu tertentu.
// Penerima sudah di-resolve saat dibuat (disimpan JSON) lalu dijalankan lewat mesin broadcast.
type ScheduledMessage struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	TenantID   uint      `gorm:"index;not null" json:"tenant_id"`
	AgentID    uint      `gorm:"index;not null" json:"agent_id"`
	RunAt      time.Time `gorm:"index" json:"run_at"`
	Message    string    `gorm:"type:text" json:"message"`
	Recipients string    `gorm:"type:longtext" json:"-"` // JSON [{number,name}]
	RecipientCount int   `json:"recipient_count"`
	// Lampiran opsional.
	MediaType string `gorm:"size:16" json:"media_type"`
	MediaPath string `json:"-"`
	FileName  string `json:"file_name"`
	Mimetype  string `json:"mimetype"`
	MinDelay  int    `json:"min_delay"`
	MaxDelay  int    `json:"max_delay"`
	Status    string `gorm:"size:16;default:scheduled;index" json:"status"` // scheduled, done, cancelled, interrupted
	BroadcastID *uint `json:"broadcast_id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
