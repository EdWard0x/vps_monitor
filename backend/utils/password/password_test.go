package password

import (
	"strings"
	"testing"
)

func TestPasswordBoundariesAndVerification(t *testing.T) {
	for _, value := range []string{"", "short", strings.Repeat("x", 73), string([]byte{0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff})} {
		if Validate(value) == nil {
			t.Fatalf("invalid password accepted, bytes=%d", len(value))
		}
	}
	provider := Provider{}
	value := strings.Repeat("p", 72)
	hash, err := provider.Hash(value)
	if err != nil {
		t.Fatal(err)
	}
	if hash == value || provider.Verify(hash, value) != nil {
		t.Fatal("bcrypt round trip failed")
	}
	if provider.Verify(hash, value+"x") == nil || provider.Verify(hash, "wrong-password") == nil {
		t.Fatal("incorrect or truncated password accepted")
	}
}
