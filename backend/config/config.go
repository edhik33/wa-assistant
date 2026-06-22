package config

import (
	"os"
	"log"

	"github.com/joho/godotenv"
)

func Load() {
	godotenv.Load(".env")
}

func Env(key, defaultVal string) string {
	v := os.Getenv(key)
	if v == "" {
		return defaultVal
	}
	return v
}

func EnvRequired(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("ERROR: %s harus diset di .env", key)
	}
	return v
}
