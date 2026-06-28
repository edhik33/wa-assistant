package models

import "time"

// Status tenant. Menentukan apakah tenant boleh memakai layanan (konek WA, auto-reply).
const (
	TenantTrial     = "trial"     // masa coba, batas nomor minimal
	TenantActive    = "active"    // langganan aktif & terbayar
	TenantSuspended = "suspended" // dibekukan manual oleh admin
	TenantExpired   = "expired"   // langganan habis, belum perpanjang
)

// Tenant = satu akun pelanggan (workspace). Semua data di-scope ke tenant ini.
type Tenant struct {
	ID          uint       `gorm:"primaryKey" json:"id"`
	Name        string     `json:"name"` // nama bisnis pelanggan
	Status      string     `gorm:"size:16;default:trial;index" json:"status"`
	PlanID      *uint      `gorm:"index" json:"plan_id"`
	Plan        *Plan      `json:"plan,omitempty"`
	TrialEndsAt *time.Time `json:"trial_ends_at"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// Plan = paket langganan. Penentu batas jumlah nomor & kuota balasan AI.
type Plan struct {
	ID                  uint   `gorm:"primaryKey" json:"id"`
	Code                string `gorm:"size:32;uniqueIndex;not null" json:"code"` // starter, growth, pro
	Name                string `gorm:"size:80;not null" json:"name"`
	Description         string `gorm:"type:text" json:"description"`
	Price               int64  `gorm:"not null;default:0" json:"price"`               // rupiah
	BillingPeriod       string `gorm:"size:16;default:monthly" json:"billing_period"` // monthly, yearly
	MaxNumbers          int    `gorm:"not null;default:1" json:"max_numbers"`
	MaxAIRepliesMonthly int    `gorm:"not null;default:0" json:"max_ai_replies_monthly"` // 0 = tanpa batas
	// Batasan "training" knowledge per agent (nomor). CATATAN: beda dari MaxAIRepliesMonthly —
	// di sini 0 = belum diset (kode fallback ke default aman), BUKAN tanpa batas, karena crawl
	// tanpa batas berisiko ke memori & biaya embedding.
	MaxKnowledgeChars   int `gorm:"not null;default:0" json:"max_knowledge_chars"`   // total karakter knowledge per agent
	MaxCrawlPages       int `gorm:"not null;default:0" json:"max_crawl_pages"`       // batas halaman per crawl
	MaxBroadcastMonthly int `gorm:"not null;default:0" json:"max_broadcast_monthly"` // pesan broadcast per bulan, 0 = tanpa batas
	// Saklar fitur per paket. Default true supaya paket lama tidak kehilangan fitur;
	// admin bisa mematikan untuk membedakan tier (mis. Sheets hanya untuk Pro).
	AllowFollowUp   bool      `gorm:"not null;default:true" json:"allow_followup"`    // follow-up / drip otomatis
	AllowGroupGuard bool      `gorm:"not null;default:true" json:"allow_group_guard"` // penjaga grup
	AllowSchedule   bool      `gorm:"not null;default:true" json:"allow_schedule"`    // pesan terjadwal
	AllowSheets     bool      `gorm:"not null;default:true" json:"allow_sheets"`      // integrasi Google Sheets + auto-catat closing
	IsActive        bool      `gorm:"not null;default:true;index" json:"is_active"`
	IsPopular       bool      `gorm:"not null;default:false" json:"is_popular"`
	SortOrder       int       `gorm:"not null;default:0;index" json:"sort_order"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// Subscription = langganan berjalan milik sebuah tenant (1:1 dengan tenant).
type Subscription struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	TenantID  uint      `gorm:"uniqueIndex;not null" json:"tenant_id"`
	PlanID    uint      `gorm:"not null;index" json:"plan_id"`
	Plan      Plan      `json:"plan"`
	Status    string    `gorm:"size:16;default:active;index" json:"status"` // active, expired, cancelled
	StartsAt  time.Time `json:"starts_at"`
	EndsAt    time.Time `gorm:"index" json:"ends_at"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Invoice = tagihan pembelian / perpanjangan plan lewat Tripay.
type Invoice struct {
	ID              uint       `gorm:"primaryKey" json:"id"`
	TenantID        uint       `gorm:"index;not null" json:"tenant_id"`
	PlanID          uint       `gorm:"index;not null" json:"plan_id"`
	MerchantRef     string     `gorm:"size:64;uniqueIndex" json:"merchant_ref"` // referensi internal kita
	TripayReference string     `gorm:"size:64;index" json:"tripay_reference"`   // referensi dari Tripay
	Amount          int64      `gorm:"not null" json:"amount"`
	Status          string     `gorm:"size:16;default:pending;index" json:"status"` // pending, paid, expired, failed
	PaymentMethod   string     `gorm:"size:32" json:"payment_method"`
	CheckoutURL     string     `gorm:"type:text" json:"checkout_url"`
	PaidAt          *time.Time `json:"paid_at"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

// BroadcastUsage = jumlah pesan broadcast terkirim per tenant per bulan (kuota paket).
// Unik per (tenant, period). Period format "YYYY-MM".
type BroadcastUsage struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	TenantID  uint      `gorm:"not null;uniqueIndex:idx_bc_usage_tenant_period,priority:1" json:"tenant_id"`
	Period    string    `gorm:"size:7;not null;uniqueIndex:idx_bc_usage_tenant_period,priority:2" json:"period"`
	Sent      int       `gorm:"not null;default:0" json:"sent"`
	UpdatedAt time.Time `json:"updated_at"`
}

// AIUsage = pemakaian balasan AI per tenant per bulan (kuota & kontrol biaya).
// Unik per (tenant, period). Period format "YYYY-MM".
type AIUsage struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	TenantID  uint      `gorm:"not null;uniqueIndex:idx_ai_usage_tenant_period,priority:1" json:"tenant_id"`
	Period    string    `gorm:"size:7;not null;uniqueIndex:idx_ai_usage_tenant_period,priority:2" json:"period"`
	Replies   int       `gorm:"not null;default:0" json:"replies"`
	TokensIn  int64     `gorm:"not null;default:0" json:"tokens_in"`
	TokensOut int64     `gorm:"not null;default:0" json:"tokens_out"`
	UpdatedAt time.Time `json:"updated_at"`
}
