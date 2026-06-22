package services

import (
	"context"
	"fmt"
	"math/rand"
	"sync"
	"time"

	"go.mau.fi/whatsmeow"
	waProto "go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"
)

// MessageHandler dipanggil tiap pesan masuk, membawa ID agent (CS) penerima.
type MessageHandler func(agentID uint, sender types.JID, msg string)

// DeviceLinkedHandler dipanggil saat agent berhasil login via QR, agar device
// JID & nomornya bisa disimpan ke DB.
type DeviceLinkedHandler func(agentID uint, jid, number string)

// WAManager memegang satu koneksi WhatsApp untuk satu agent.
type WAManager struct {
	mu      sync.Mutex
	agentID uint
	client  *whatsmeow.Client
	qrCode  string
	status  string // "disconnected", "qr", "connected"
}

var (
	container *sqlstore.Container
	managers  = map[uint]*WAManager{}
	regMu     sync.Mutex
	onMessage MessageHandler
	onLinked  DeviceLinkedHandler
)

func InitWA(dbPath string) {
	c, err := sqlstore.New(context.Background(), "sqlite3", "file:"+dbPath+"?_foreign_keys=on", waLog.Noop)
	if err != nil {
		panic(err)
	}
	container = c
}

// SetHandlers mendaftarkan callback global (dipanggil sekali dari main).
func SetHandlers(msg MessageHandler, linked DeviceLinkedHandler) {
	onMessage = msg
	onLinked = linked
}

// WA mengembalikan manager untuk satu agent, membuatnya jika belum ada.
func WA(agentID uint) *WAManager {
	regMu.Lock()
	defer regMu.Unlock()
	m, ok := managers[agentID]
	if !ok {
		m = &WAManager{agentID: agentID, status: "disconnected"}
		managers[agentID] = m
	}
	return m
}

// FirstDeviceJID mengembalikan JID device pertama di sesi whatsmeow.
// Dipakai untuk migrasi single-number lama ke agent default.
func FirstDeviceJID() string {
	devices, err := container.GetAllDevices(context.Background())
	if err != nil || len(devices) == 0 || devices[0].ID == nil {
		return ""
	}
	return devices[0].ID.String()
}

// Connect menghubungkan agent. deviceJID kosong = device baru (keluar QR);
// terisi = pakai device yang sudah ter-link.
func (m *WAManager) Connect(deviceJID string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.client != nil {
		if !m.client.IsConnected() {
			_ = m.client.Connect()
		}
		return m.status, nil
	}

	ctx := context.Background()
	device := container.NewDevice()
	if deviceJID != "" {
		jid, err := types.ParseJID(deviceJID)
		if err != nil {
			return "", err
		}
		if d, err := container.GetDevice(ctx, jid); err == nil && d != nil {
			device = d
		}
	}

	m.client = whatsmeow.NewClient(device, waLog.Noop)
	m.client.AddEventHandler(m.handleEvent)

	if m.client.Store.ID == nil {
		qrChan, _ := m.client.GetQRChannel(ctx)
		if err := m.client.Connect(); err != nil {
			return "", err
		}
		go m.watchQR(qrChan)
		m.status = "qr"
		return "qr", nil
	}

	if err := m.client.Connect(); err != nil {
		return "", err
	}
	m.status = "connected"
	return "connected", nil
}

func (m *WAManager) watchQR(qrChan <-chan whatsmeow.QRChannelItem) {
	for evt := range qrChan {
		if evt.Event == "code" {
			m.mu.Lock()
			m.qrCode = evt.Code
			m.status = "qr"
			m.mu.Unlock()
			continue
		}
		// Login selesai / channel berakhir.
		m.mu.Lock()
		m.qrCode = ""
		jid := (*types.JID)(nil)
		if m.client != nil {
			jid = m.client.Store.ID
		}
		if jid != nil {
			m.status = "connected"
		} else {
			m.status = "disconnected"
		}
		m.mu.Unlock()
		if jid != nil && onLinked != nil {
			onLinked(m.agentID, jid.String(), jid.User)
		}
		return
	}
}

func (m *WAManager) handleEvent(evt interface{}) {
	msg, ok := evt.(*events.Message)
	if !ok {
		return
	}
	// Lewati pesan grup & pesan yang kita kirim sendiri (cegah balas ke diri sendiri / loop).
	if msg.Info.IsGroup || msg.Info.IsFromMe {
		return
	}
	// Tandai pesan sudah dibaca (centang biru) — terlihat natural.
	_ = m.client.MarkRead(context.Background(), []types.MessageID{msg.Info.ID}, time.Now(), msg.Info.Chat, msg.Info.Sender)

	text := msg.Message.GetConversation()
	if text == "" {
		// Pesan balasan / berformat datang sebagai ExtendedTextMessage, bukan Conversation.
		if ext := msg.Message.GetExtendedTextMessage(); ext != nil {
			text = ext.GetText()
		}
	}
	if text != "" && onMessage != nil {
		go onMessage(m.agentID, msg.Info.Sender, text)
	}
}

func (m *WAManager) GetQR() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.qrCode
}

func (m *WAManager) GetStatus() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.status
}

// GetInfo mengembalikan nomor & nama profil WhatsApp yang sedang terhubung.
func (m *WAManager) GetInfo() (number, name string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.client == nil || m.client.Store.ID == nil {
		return "", ""
	}
	return m.client.Store.ID.User, m.client.Store.PushName
}

func (m *WAManager) SendMessage(to types.JID, message string) error {
	m.mu.Lock()
	client := m.client
	m.mu.Unlock()
	if client == nil || !client.IsConnected() {
		return fmt.Errorf("client WA tidak terhubung")
	}

	ctx := context.Background()
	// Humanisasi: tampilkan "mengetik...", beri jeda wajar, lalu kirim (kurangi risiko banned).
	_ = client.SendPresence(ctx, types.PresenceAvailable)
	_ = client.SendChatPresence(ctx, to, types.ChatPresenceComposing, types.ChatPresenceMediaText)
	time.Sleep(humanDelay(message))
	_ = client.SendChatPresence(ctx, to, types.ChatPresencePaused, types.ChatPresenceMediaText)

	_, err := client.SendMessage(ctx, to, &waProto.Message{
		Conversation: proto.String(message),
	})
	return err
}

// humanDelay meniru kecepatan mengetik manusia: jeda dasar acak + proporsional panjang pesan, dibatasi 6 detik.
func humanDelay(msg string) time.Duration {
	ms := 1500 + rand.Intn(1500) + len([]rune(msg))*25
	if ms > 6000 {
		ms = 6000
	}
	return time.Duration(ms) * time.Millisecond
}
