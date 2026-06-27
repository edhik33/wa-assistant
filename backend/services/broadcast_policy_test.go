package services

import (
	"testing"
	"time"
)

func TestValidBroadcastConsentEvidence(t *testing.T) {
	now := time.Now()
	if !ValidBroadcastConsentEvidence("marketing", "form", now.Add(-time.Hour), true, now) {
		t.Fatal("expected complete consent evidence to be valid")
	}

	tests := []struct {
		category  string
		source    string
		grantedAt time.Time
		confirmed bool
	}{
		{"marketing", "form", now, false},
		{"unknown", "form", now, true},
		{"marketing", "unknown", now, true},
		{"marketing", "form", now.Add(48 * time.Hour), true},
	}
	for i, test := range tests {
		if ValidBroadcastConsentEvidence(test.category, test.source, test.grantedAt, test.confirmed, now) {
			t.Fatalf("case %d should be invalid", i)
		}
	}
}

func TestValidateBroadcastRiskConfirmation(t *testing.T) {
	if got := ValidateBroadcastRiskConfirmation("medium", true, false, "", "", "blocked"); got == "" {
		t.Fatal("medium risk should require acknowledgement")
	}
	if got := ValidateBroadcastRiskConfirmation("medium", true, true, "", "", "blocked"); got != "" {
		t.Fatalf("acknowledged medium risk should pass: %s", got)
	}
	if got := ValidateBroadcastRiskConfirmation("high", true, true, "SALAH", "alasan", "blocked"); got == "" {
		t.Fatal("high risk should require the exact phrase")
	}
	if got := ValidateBroadcastRiskConfirmation("high", true, false, BroadcastOverridePhrase, "Penerima baru mendaftar", "blocked"); got != "" {
		t.Fatalf("complete high-risk override should pass: %s", got)
	}
	if got := ValidateBroadcastRiskConfirmation("low", false, false, "", "", "Belum bisa dikirim"); got != "Belum bisa dikirim" {
		t.Fatalf("blocked assessment should return its title, got %q", got)
	}
}
