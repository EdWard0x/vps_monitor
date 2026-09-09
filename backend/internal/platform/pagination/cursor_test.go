package pagination

import (
	"testing"
	"time"
)

func TestCursorBinding(t *testing.T) {
	s := Signer{Secret: []byte("01234567890123456789012345678901")}
	raw := s.Encode(Cursor{Scope: "vps:1", Time: time.Now().UTC(), ID: 5})
	if _, e := s.Decode(raw, "vps:1"); e != nil {
		t.Fatal(e)
	}
	if _, e := s.Decode(raw, "vps:2"); e == nil {
		t.Fatal("cursor reused across scope")
	}
}
