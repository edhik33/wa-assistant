package handlers

import (
	"errors"
	"fmt"
	"testing"

	"go.mau.fi/whatsmeow"
)

func TestClassifyBroadcastSendError(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantAction broadcastSendErrorAction
		wantCode   int
	}{
		{
			name:       "whatsapp restriction",
			err:        fmt.Errorf("%w %d", whatsmeow.ErrServerReturnedError, 463),
			wantAction: broadcastErrorWARestricted,
			wantCode:   463,
		},
		{
			name:       "connection lost",
			err:        errors.New("client WA tidak terhubung"),
			wantAction: broadcastErrorInterrupted,
		},
		{
			name:       "recipient failure",
			err:        errors.New("unknown recipient error"),
			wantAction: broadcastErrorFailed,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			action, code := classifyBroadcastSendError(tt.err)
			if action != tt.wantAction || code != tt.wantCode {
				t.Fatalf("classifyBroadcastSendError() = (%q, %d), want (%q, %d)", action, code, tt.wantAction, tt.wantCode)
			}
		})
	}
}
