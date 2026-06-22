package models

import "time"

type User struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Name      string    `json:"name"`
	Username  string    `gorm:"unique;not null" json:"username"`
	Email     string    `gorm:"unique" json:"email"`
	Password  string    `json:"-"`
	CreatedAt time.Time `json:"created_at"`
}

// Agent = satu CS / nomor WhatsApp, punya persona & knowledge sendiri.
type Agent struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Name         string    `json:"name"`
	SystemPrompt string    `gorm:"type:text" json:"system_prompt"`
	Tone         string    `gorm:"default:ramah" json:"tone"`
	DeviceJID    string    `json:"device_jid"` // device whatsmeow yang ter-link
	Number       string    `json:"number"`     // nomor WA (cache untuk tampilan)
	CreatedAt    time.Time `json:"created_at"`
}

type ChatHistory struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	AgentID   uint      `gorm:"index" json:"agent_id"`
	Sender    string    `json:"sender"`
	Message   string    `json:"message"`
	Reply     string    `json:"reply"`
	CreatedAt time.Time `json:"created_at"`
}

type Setting struct {
	ID           uint   `gorm:"primaryKey" json:"id"`
	SystemPrompt string `gorm:"type:text" json:"system_prompt"`
	AIModel      string `gorm:"default:deepseek-v4-pro" json:"ai_model"`
	Tone         string `gorm:"default:ramah" json:"tone"` // ramah, formal, santai, persuasif, custom
}

type Knowledge struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	AgentID   uint      `gorm:"index" json:"agent_id"`
	Question  string    `gorm:"type:text" json:"question"`
	Answer    string    `gorm:"type:text" json:"answer"`
	Tags      string    `json:"tags"`
	Embedding string    `gorm:"type:longtext" json:"-"` // vektor embedding (JSON []float32) untuk semantic search
	CreatedAt time.Time `json:"created_at"`
}
