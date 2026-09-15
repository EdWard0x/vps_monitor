package csrf

import (
	"bytes"
	"context"
	"errors"
	"testing"
	"time"

	"vpsmonitor/model/errcode"
)

func TestIssueAndVerify(t *testing.T) {
	now := time.Date(2026, 9, 13, 4, 0, 0, 0, time.UTC)
	provider := New("0123456789abcdef0123456789abcdef", 2*time.Hour)
	provider.now = func() time.Time { return now }
	provider.random = bytes.NewReader(bytes.Repeat([]byte{0x42}, nonceBytes))
	token, err := provider.Issue(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if err := provider.Verify(context.Background(), token); err != nil {
		t.Fatalf("valid token rejected: %v", err)
	}

	tampered := token[:len(token)-1] + "A"
	if tampered == token {
		tampered = token[:len(token)-1] + "B"
	}
	if !errors.Is(provider.Verify(context.Background(), tampered), errcode.CSRFRejected) {
		t.Fatal("tampered token must be rejected")
	}

	provider.now = func() time.Time { return now.Add(2*time.Hour + time.Second) }
	if !errors.Is(provider.Verify(context.Background(), token), errcode.CSRFRejected) {
		t.Fatal("expired token must be rejected")
	}
}

func TestIssueRejectsWeakConfiguration(t *testing.T) {
	provider := New("too-short", time.Hour)
	if _, err := provider.Issue(context.Background()); !errors.Is(err, ErrInvalidConfiguration) {
		t.Fatalf("got %v", err)
	}
}
