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
- Backend: Go, Gin, GORM, SQLite, whatsmeow
- Frontend: React, TypeScript, MUI
- AI: DeepSeek V4 Pro (OpenAI-compatible)

## Setup
```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your API keys
cd wa-assistant && ./wa-server
cd frontend && npm install && npm run dev
```

## Login
- Username: admin
- Password: admin123
