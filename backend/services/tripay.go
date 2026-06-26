package services

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"wa-assistant/backend/config"
)

var ErrTripayNotConfigured = errors.New("tripay belum dikonfigurasi")

var tripayHTTP = &http.Client{Timeout: 20 * time.Second}

type tripayCfg struct {
	apiKey       string
	privateKey   string
	merchantCode string
	baseURL      string
}

func loadTripayCfg() (tripayCfg, error) {
	cfg := tripayCfg{
		apiKey:       config.Env("TRIPAY_API_KEY", ""),
		privateKey:   config.Env("TRIPAY_PRIVATE_KEY", ""),
		merchantCode: config.Env("TRIPAY_MERCHANT_CODE", ""),
	}
	if cfg.apiKey == "" || cfg.privateKey == "" || cfg.merchantCode == "" {
		return cfg, ErrTripayNotConfigured
	}
	if config.Env("TRIPAY_MODE", "sandbox") == "production" {
		cfg.baseURL = "https://tripay.co.id/api"
	} else {
		cfg.baseURL = "https://tripay.co.id/api-sandbox"
	}
	return cfg, nil
}

func hmacSHA256(data, key string) string {
	mac := hmac.New(sha256.New, []byte(key))
	mac.Write([]byte(data))
	return hex.EncodeToString(mac.Sum(nil))
}

// ListTripayPaymentChannels mengembalikan metode pembayaran aktif (QRIS, VA, dll).
func ListTripayPaymentChannels() ([]map[string]any, error) {
	cfg, err := loadTripayCfg()
	if err != nil {
		return nil, err
	}
	req, _ := http.NewRequest("GET", cfg.baseURL+"/merchant/payment-channel", nil)
	req.Header.Set("Authorization", "Bearer "+cfg.apiKey)
	resp, err := tripayHTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("gagal menghubungi Tripay: %w", err)
	}
	defer resp.Body.Close()

	var out struct {
		Success bool             `json:"success"`
		Message string           `json:"message"`
		Data    []map[string]any `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("respons Tripay tidak valid: %w", err)
	}
	if !out.Success {
		return nil, fmt.Errorf("tripay: %s", out.Message)
	}
	return out.Data, nil
}

type TripayTxParams struct {
	Method        string
	MerchantRef   string
	Amount        int64
	CustomerName  string
	CustomerEmail string
	ItemName      string
	ReturnURL     string
}

type TripayTxResult struct {
	Reference   string `json:"reference"`
	CheckoutURL string `json:"checkout_url"`
}

// CreateTripayTransaction membuat transaksi closed-payment & mengembalikan URL checkout.
func CreateTripayTransaction(p TripayTxParams) (*TripayTxResult, error) {
	cfg, err := loadTripayCfg()
	if err != nil {
		return nil, err
	}
	signature := hmacSHA256(cfg.merchantCode+p.MerchantRef+strconv.FormatInt(p.Amount, 10), cfg.privateKey)

	body, _ := json.Marshal(map[string]any{
		"method":         p.Method,
		"merchant_ref":   p.MerchantRef,
		"amount":         p.Amount,
		"customer_name":  p.CustomerName,
		"customer_email": p.CustomerEmail,
		"order_items": []map[string]any{
			{"name": p.ItemName, "price": p.Amount, "quantity": 1},
		},
		"return_url": p.ReturnURL,
		"signature":  signature,
	})

	req, _ := http.NewRequest("POST", cfg.baseURL+"/transaction/create", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+cfg.apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := tripayHTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("gagal menghubungi Tripay: %w", err)
	}
	defer resp.Body.Close()

	var out struct {
		Success bool           `json:"success"`
		Message string         `json:"message"`
		Data    TripayTxResult `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("respons Tripay tidak valid: %w", err)
	}
	if !out.Success {
		return nil, fmt.Errorf("tripay: %s", out.Message)
	}
	return &out.Data, nil
}

// VerifyTripayCallback memvalidasi signature webhook (HMAC-SHA256 dari raw body memakai private key).
func VerifyTripayCallback(rawBody []byte, signature string) bool {
	cfg, err := loadTripayCfg()
	if err != nil {
		return false
	}
	expected := hmacSHA256(string(rawBody), cfg.privateKey)
	return hmac.Equal([]byte(expected), []byte(signature))
}
