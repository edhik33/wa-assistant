package models

import (
	"time"

	"gorm.io/gorm"
)

// Agent merepresentasikan satu sesi WhatsApp yang tertaut — satu CS/AI per nomor.
type Agent struct {
	ID           uint   `gorm:"primaryKey" json:"id"`
	TenantID     uint   `gorm:"index;not null" json:"tenant_id"`
	Name         string `json:"name"`
	SystemPrompt string `gorm:"type:text" json:"system_prompt"`
	Tone         string `gorm:"default:ramah" json:"tone"`
	AIEnabled    bool   `gorm:"not null" json:"ai_enabled"` // master switch balasan AI — default OFF, diaktifkan user setelah setup
	DeviceJID    string `json:"device_jid"`
	Number       string `json:"number"`

	GreetingEnabled bool   `gorm:"not null;default:false" json:"greeting_enabled"`
	GreetingMessage string `gorm:"type:text" json:"greeting_message"`

	BusinessHoursEnabled bool   `gorm:"not null;default:false" json:"business_hours_enabled"`
	BusinessStart        string `gorm:"size:5;default:'08:00'" json:"business_start"`
	BusinessEnd          string `gorm:"size:5;default:'21:00'" json:"business_end"`
	AwayMessage          string `gorm:"type:text" json:"away_message"`

	// Deprecated: ringkasan percakapan kini disimpan per-kontak di ConversationMemory
	// (dulu global per agent -> bocor antar-customer). Kolom ini tidak lagi dibaca/ditulis.
	ConversationSummary string     `gorm:"type:text" json:"conversation_summary"`
	LastSummaryAt       *time.Time `json:"last_summary_at"`

	// Integrasi Google Sheets untuk export data closing otomatis.
	SpreadsheetURL       string `gorm:"type:text" json:"spreadsheet_url"`
	SpreadsheetSheetName string `gorm:"size:80;default:'Leads'" json:"spreadsheet_sheet_name"`
	SheetSyncEnabled     bool   `gorm:"not null;default:false" json:"sheet_sync_enabled"`

	// Cek ongkir realtime via RajaOngkir.
	OriginCityID      int    `gorm:"default:0" json:"origin_city_id"`
	OriginCityName    string `gorm:"size:100" json:"origin_city_name"`
	DefaultWeightGram int    `gorm:"default:1000" json:"default_weight_gram"`
	EnabledCouriers   string `gorm:"size:100;default:'jne,jnt,sicepat'" json:"enabled_couriers"`

	CreatedAt time.Time `json:"created_at"`
}

type ChatHistory struct {
	ID             uint       `gorm:"primaryKey" json:"id"`
	AgentID        uint       `gorm:"index" json:"agent_id"`
	Sender         string     `gorm:"index;size:32" json:"sender"`
	Message        string     `json:"message"`
	Reply          string     `json:"reply"`
	FromHuman      bool       `gorm:"not null;default:false" json:"from_human"`
	MediaType      string     `gorm:"size:16" json:"media_type"`
	MediaPath      string     `json:"-"`
	FileName       string     `json:"file_name"`
	Mimetype       string     `json:"mimetype"`
	WAMsgID        string     `gorm:"size:64" json:"wa_msg_id"`
	ReplyTo        string     `json:"reply_to"`
	ReplyText      string     `gorm:"size:200" json:"reply_text"`
	Revoked        bool       `gorm:"default:false" json:"revoked"`
	DeliveryStatus string     `gorm:"size:24;index;default:sent" json:"delivery_status"` // sent, pending_retry, failed_send
	SendError      string     `gorm:"type:text" json:"send_error,omitempty"`
	RetryCount     int        `gorm:"not null;default:0" json:"retry_count"`
	NextRetryAt    *time.Time `gorm:"index" json:"next_retry_at,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
}

type AITurn struct {
	ID                 uint      `gorm:"primaryKey" json:"id"`
	AgentID            uint      `gorm:"index;not null" json:"agent_id"`
	Sender             string    `gorm:"index;size:32" json:"sender"`
	UserMessage        string    `gorm:"type:text" json:"user_message"`
	AIReply            string    `gorm:"type:text" json:"ai_reply"`
	Model              string    `gorm:"size:80" json:"model"`
	PromptVersion      string    `gorm:"size:40;default:'legacy';index" json:"prompt_version"`
	KnowledgeUsedCount int       `json:"knowledge_used_count"`
	UsedShippingTool   bool      `gorm:"not null;default:false;index" json:"used_shipping_tool"`
	Escalated          bool      `gorm:"not null;default:false;index" json:"escalated"`
	Error              string    `gorm:"type:text" json:"error"`
	LatencyMs          int64     `json:"latency_ms"`
	CreatedAt          time.Time `gorm:"index" json:"created_at"`
}

func (AITurn) TableName() string { return "ai_turns" }

type Contact struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	AgentID   uint      `gorm:"uniqueIndex:idx_contact_agent_number;not null" json:"agent_id"`
	Number    string    `gorm:"uniqueIndex:idx_contact_agent_number;size:32;not null" json:"number"`
	Name      string    `json:"name"`
	Notes     string    `gorm:"type:text" json:"notes"`
	Tags      string    `gorm:"type:text" json:"tags"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ConversationMemory menyimpan ringkasan percakapan jangka panjang per (agent, kontak).
// Dipisah per pengirim agar konteks satu customer tidak bocor ke customer lain.
type ConversationMemory struct {
	ID            uint       `gorm:"primaryKey" json:"id"`
	AgentID       uint       `gorm:"uniqueIndex:idx_convmem_agent_sender;not null" json:"agent_id"`
	Sender        string     `gorm:"uniqueIndex:idx_convmem_agent_sender;size:32;not null" json:"sender"`
	Summary       string     `gorm:"type:text" json:"summary"`
	LastSummaryAt *time.Time `json:"last_summary_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

type Handoff struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	AgentID   uint      `gorm:"index" json:"agent_id"`
	Sender    string    `gorm:"index;size:32" json:"sender"`
	LastMsg   string    `gorm:"type:text" json:"last_msg"`
	CreatedAt time.Time `json:"created_at"`
}

type Setting struct {
	ID           uint   `gorm:"primaryKey" json:"id"`
	SystemPrompt string `gorm:"type:text" json:"system_prompt"`
	AIModel      string `gorm:"default:deepseek-v4-pro" json:"ai_model"`
	Tone         string `gorm:"default:ramah" json:"tone"`
}

type Knowledge struct {
	ID        uint   `gorm:"primaryKey" json:"id"`
	AgentID   uint   `gorm:"index" json:"agent_id"`
	Question  string `gorm:"type:text" json:"question"`
	Answer    string `gorm:"type:text" json:"answer"`
	Tags      string `json:"tags"`
	Embedding string `gorm:"type:longtext" json:"-"`
	// EmbeddingModel = tanda tangan model+dimensi saat vektor dibuat (mis. "text-embedding-3-small"
	// atau "...:512"). Dipakai mendeteksi perubahan model agar knowledge di-embed ulang otomatis.
	EmbeddingModel string `gorm:"size:80" json:"-"`
	// Source = asal knowledge: manual, wizard, web, dokumen. SourceURL = URL halaman asal (untuk web).
	// Dipakai mengelompokkan & menghapus knowledge per sumber (mis. hapus semua dari 1 website).
	Source    string    `gorm:"size:16;default:manual;index" json:"source"`
	SourceURL string    `gorm:"type:text" json:"source_url"`
	CharCount int       `gorm:"not null;default:0" json:"char_count"` // panjang Answer, untuk hitung kuota karakter
	CreatedAt time.Time `json:"created_at"`
}

// BeforeSave menjaga CharCount selalu = panjang Answer (dipakai untuk kuota karakter),
// otomatis di semua jalur Create/Save tanpa perlu set manual di tiap handler.
func (k *Knowledge) BeforeSave(*gorm.DB) error {
	k.CharCount = len([]rune(k.Answer))
	return nil
}

// CrawlJob = satu sesi crawl website untuk satu agent (nomor). Berjalan di background;
// frontend polling statusnya. Semua data crawl di-scope ke agent_id agar tidak kecampur antar-nomor.
type CrawlJob struct {
	ID         uint       `gorm:"primaryKey" json:"id"`
	AgentID    uint       `gorm:"index;not null" json:"agent_id"`
	RootURL    string     `gorm:"type:text" json:"root_url"`
	Domain     string     `gorm:"size:255" json:"domain"`
	Status     string     `gorm:"size:16;index;default:pending" json:"status"` // pending, crawling, training, done, failed
	PagesFound int        `gorm:"not null;default:0" json:"pages_found"`
	Error      string     `gorm:"type:text" json:"error"`
	CreatedAt  time.Time  `json:"created_at"`
	FinishedAt *time.Time `json:"finished_at"`
}

// CrawlPage = satu halaman hasil crawl. content disimpan agar bisa dilatih nanti tanpa fetch ulang.
type CrawlPage struct {
	ID        uint   `gorm:"primaryKey" json:"id"`
	JobID     uint   `gorm:"index;not null" json:"job_id"`
	AgentID   uint   `gorm:"index;not null" json:"agent_id"`
	URL       string `gorm:"type:text" json:"url"`
	Title     string `gorm:"type:text" json:"title"`
	Status    string `gorm:"size:16;index;default:found" json:"status"` // found, crawled, failed, training, trained, skipped
	CharCount int    `gorm:"not null;default:0" json:"char_count"`
	Content   string `gorm:"type:longtext" json:"-"` // teks bersih (tidak dikirim ke frontend, bisa besar)
	Error     string `gorm:"type:text" json:"error"`
	// Recommended = halaman layak dilatih (konten cukup & bukan halaman low-value seperti
	// privacy/terms/tag). Dipakai UI untuk auto-centang halaman penting saja.
	Recommended bool       `gorm:"not null;default:false" json:"recommended"`
	TrainedAt   *time.Time `json:"trained_at"`
	CreatedAt   time.Time  `json:"created_at"`
}

type User struct {
	ID                  uint       `gorm:"primaryKey" json:"id"`
	Username            string     `gorm:"uniqueIndex;size:64;not null" json:"username"`
	Password            string     `json:"-"`
	Role                string     `gorm:"size:24;default:owner" json:"role"`
	Name                string     `json:"name"`
	Email               string     `gorm:"size:255" json:"email"`
	EmailVerified       bool       `gorm:"default:false" json:"email_verified"`
	EmailVerifyToken    string     `gorm:"size:128" json:"-"`
	Phone               string     `gorm:"size:32;index" json:"phone"`
	TenantID            *uint      `gorm:"index" json:"tenant_id"`
	IsSuperAdmin        bool       `gorm:"default:false" json:"is_super_admin"`
	PasswordResetToken  string     `gorm:"size:128" json:"-"`
	PasswordResetExpiry *time.Time `json:"-"`
}

// LoginThrottle menyimpan rate-limit login secara persistent agar tidak hilang saat restart.
type LoginThrottle struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	Key         string    `gorm:"size:255;uniqueIndex;not null" json:"key"`
	Failures    int       `gorm:"not null;default:0" json:"failures"`
	FirstSeen   time.Time `gorm:"index" json:"first_seen"`
	LockedUntil time.Time `gorm:"index" json:"locked_until"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// ClosingForm = skema data closing yang dikumpulkan AI per agent.
type ClosingForm struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	AgentID    uint      `gorm:"uniqueIndex;not null" json:"agent_id"`
	SchemaJSON string    `gorm:"type:text" json:"schema_json"` // JSON definisi field
	Enabled    bool      `gorm:"not null;default:true" json:"enabled"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// ClosingRecord = satu data closing yang berhasil diekstrak AI.
type ClosingRecord struct {
	ID             uint       `gorm:"primaryKey" json:"id"`
	AgentID        uint       `gorm:"index;not null" json:"agent_id"`
	Sender         string     `gorm:"index;size:32" json:"sender"`
	Status         string     `gorm:"size:20;default:'detected'" json:"status"` // detected, exported, failed, duplicate
	Confidence     float64    `json:"confidence"`
	DataJSON       string     `gorm:"type:text" json:"data_json"`
	RawSummary     string     `gorm:"type:text" json:"raw_summary"`
	SheetError     string     `json:"sheet_error"`
	IdempotencyKey string     `gorm:"size:128;uniqueIndex" json:"idempotency_key"`
	SheetRow       int        `gorm:"default:0" json:"sheet_row"` // nomor baris di Google Sheet (untuk update-in-place)
	ExportedAt     *time.Time `json:"exported_at"`
	CreatedAt      time.Time  `json:"created_at"`
}

// ShippingCity = daftar kota/kabupaten dari RajaOngkir (cache lokal).
type ShippingCity struct {
	ID           uint   `gorm:"primaryKey" json:"id"`
	RajaOngkirID int    `gorm:"uniqueIndex" json:"rajaongkir_id"`
	Province     string `gorm:"size:100" json:"province"`
	Type         string `gorm:"size:20" json:"type"` // Kota / Kabupaten
	CityName     string `gorm:"size:100" json:"city_name"`
	FullName     string `gorm:"size:200" json:"full_name"` // "Kota Bandung"
	SearchText   string `gorm:"type:text" json:"-"`        // lowercase untuk search
}
