package jwt

import (
	"context"
	"errors"
	"testing"
	"time"

	authiface "vpsmonitor/iface/auth"
	"vpsmonitor/model/errcode"
)

func TestIssueAndVerify(t *testing.T) {
	p := New(
		"0123456789abcdef0123456789abcdef",
		"abcdef0123456789abcdef0123456789",
		"vps-monitor", "vps-monitor-api", "vps-monitor-refresh",
		15*time.Minute, 7*24*time.Hour,
	)

	pair, err := p.Issue(context.Background(), authiface.TokenIssueInput{UserID: "1", TokenVersion: 1})
	if err != nil {
		t.Fatal(err)
	}
	claims, err := p.Verify(context.Background(), pair.AccessToken, authiface.AccessToken)
	if err != nil {
		t.Fatal(err)
	}
	if claims.Subject != "1" || claims.TokenVersion != 1 {
		t.Fatalf("unexpected claims: %#v", claims)
	}
	if _, err := p.Verify(context.Background(), pair.AccessToken, authiface.RefreshToken); !errors.Is(err, errcode.InvalidToken) {
		t.Fatalf("access token must not be accepted as refresh token: %v", err)
	}
}

func TestRefreshDeadlineCannotBeExtendedOrReopened(t *testing.T) {
	p := New("0123456789abcdef0123456789abcdef", "abcdef0123456789abcdef0123456789", "issuer", "access", "refresh", 15*time.Minute, 24*time.Hour)
	deadline := time.Now().Add(2 * time.Minute).Truncate(time.Second)
	pair, err := p.Issue(context.Background(), authiface.TokenIssueInput{UserID: "7", TokenVersion: 3, RefreshExpiresAt: deadline})
	if err != nil {
		t.Fatal(err)
	}
	for _, token := range []struct {
		raw  string
		kind authiface.TokenKind
	}{{pair.AccessToken, authiface.AccessToken}, {pair.RefreshToken, authiface.RefreshToken}} {
		claims, err := p.Verify(context.Background(), token.raw, token.kind)
		if err != nil || !claims.ExpiresAt.Equal(deadline) {
			t.Fatalf("deadline changed: claims=%+v err=%v", claims, err)
		}
	}
	if _, err := p.Issue(context.Background(), authiface.TokenIssueInput{UserID: "7", TokenVersion: 3, RefreshExpiresAt: time.Now().Add(-time.Second)}); !errors.Is(err, errcode.InvalidToken) {
		t.Fatalf("expired session reopened: %v", err)
	}
	if _, err := p.Verify(context.Background(), pair.AccessToken, authiface.TokenKind("other")); !errors.Is(err, errcode.InvalidToken) {
		t.Fatalf("unknown token kind accepted: %v", err)
	}
}
