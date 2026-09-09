package security

import (
	"testing"
	"time"
)

func TestPasswordAndTokens(t *testing.T) {
	h, e := HashPassword("correct horse battery staple")
	if e != nil || !VerifyPassword(h, "correct horse battery staple") || VerifyPassword(h, "wrong password value") {
		t.Fatal("password contract failed")
	}
	tok := Tokens{AccessSecret: []byte("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), RefreshSecret: []byte("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"), Issuer: "issuer", AccessAudience: "api", RefreshAudience: "refresh"}
	a, r, j, _, e := tok.Issue(42, "sid", time.Now().Add(time.Hour))
	if e != nil || j == "" {
		t.Fatal(e)
	}
	if _, e = tok.Verify(a, "access"); e != nil {
		t.Fatal(e)
	}
	if _, e = tok.Verify(r, "refresh"); e != nil {
		t.Fatal(e)
	}
	if _, e = tok.Verify(a, "refresh"); e == nil {
		t.Fatal("token type substitution accepted")
	}
}
func TestCSRF(t *testing.T) {
	c := CSRF{Secret: []byte("cccccccccccccccccccccccccccccccc")}
	x, e := c.Issue()
	if e != nil || !c.Valid(x) {
		t.Fatal("csrf issue/verify")
	}
	if c.Valid(x + "x") {
		t.Fatal("tampered csrf accepted")
	}
}
