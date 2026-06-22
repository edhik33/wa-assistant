package database

import (
	"fmt"
	"log"
	"wa-assistant/backend/config"
	"wa-assistant/backend/models"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

var DB *gorm.DB

func Init() {
	host := config.Env("DB_HOST", "localhost")
	port := config.Env("DB_PORT", "3306")
	user := config.Env("DB_USER", "root")
	pass := config.Env("DB_PASS", "")
	name := config.Env("DB_NAME", "wa_assistant")

	// Buat database-nya kalau belum ada (connect tanpa nama DB dulu).
	rootDSN := fmt.Sprintf("%s:%s@tcp(%s:%s)/?charset=utf8mb4&parseTime=True&loc=Local", user, pass, host, port)
	if rootDB, err := gorm.Open(mysql.Open(rootDSN), &gorm.Config{}); err == nil {
		rootDB.Exec("CREATE DATABASE IF NOT EXISTS `" + name + "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
		if sqlDB, e := rootDB.DB(); e == nil {
			sqlDB.Close()
		}
	}

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=True&loc=Local", user, pass, host, port, name)
	var err error
	DB, err = gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatal("DB error (MySQL): ", err)
	}
	DB.AutoMigrate(&models.User{}, &models.Agent{}, &models.ChatHistory{}, &models.Setting{}, &models.Knowledge{})

	// Migrasi ke multi-agent: pastikan ada agent default (CS pertama).
	var agentCount int64
	DB.Model(&models.Agent{}).Count(&agentCount)
	if agentCount == 0 {
		var s models.Setting // ambil persona lama jika ada
		DB.First(&s)
		def := models.Agent{Name: "CS Utama", SystemPrompt: s.SystemPrompt, Tone: s.Tone}
		if def.Tone == "" {
			def.Tone = "ramah"
		}
		DB.Create(&def)
		// Pindahkan knowledge & chat history lama (belum punya agent) ke agent default ini.
		DB.Model(&models.Knowledge{}).Where("agent_id = 0 OR agent_id IS NULL").Update("agent_id", def.ID)
		DB.Model(&models.ChatHistory{}).Where("agent_id = 0 OR agent_id IS NULL").Update("agent_id", def.ID)
		log.Printf("Migrasi: agent default '%s' (id=%d) dibuat, data lama dipindahkan", def.Name, def.ID)
	}

	// Seed admin user if not exists
	var count int64
	DB.Model(&models.User{}).Count(&count)
	if count == 0 {
		hash, _ := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
		DB.Create(&models.User{
			Name: "Admin", Username: "admin", Email: "admin@wa-assistant.local",
			Password: string(hash),
		})
		log.Println("Seeder: admin user created (admin / admin123)")
	}

	log.Println("Database ready")
}
