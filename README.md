# WA AI Assistant

WhatsApp AI Assistant with Go + React. Auto-reply to WhatsApp messages using DeepSeek V4 Pro AI with knowledge base.

## Features
- Auto-reply WhatsApp messages with AI
- Knowledge base with AI auto-generator
- Tone selector (Ramah, Formal, Santai, Persuasif)
- Admin dashboard with login
- Chat history and analytics
- QR code scan for WhatsApp connect

## Tech Stack
- Backend: Go, Gin, GORM, MySQL, SQLite session storage, whatsmeow
- Frontend: React, TypeScript, MUI
- AI: DeepSeek V4 Pro (OpenAI-compatible)

## Setup
```bash
cp .env.example .env
# Edit .env: set JWT_SECRET, DB credential, SUPERADMIN_USERNAME, and SUPERADMIN_PASSWORD
# Production: set APP_ENV=production and CORS_ALLOWED_ORIGINS to your real frontend domain
cd wa-assistant && ./wa-server
cd frontend && npm install && npm run dev
```

## Login
Tidak ada password default yang aman untuk production. Super admin dibuat dari env:

```env
SUPERADMIN_USERNAME=superadmin
SUPERADMIN_PASSWORD=isi_password_superadmin_minimal_12_karakter
```
