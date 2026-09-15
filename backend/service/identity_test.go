package service

import "testing"

func TestUserIDRejectsQueryFragmentsAndInvalidNumbers(t *testing.T) {
	for _, value := range []string{"", "0", "-1", "+1", " 1", "1 ", "1 OR 1=1", "9223372036854775808"} {
		if _, err := parseUserID(value); err == nil {
			t.Fatalf("invalid ID accepted: %q", value)
		}
	}
	if id, err := parseUserID("42"); err != nil || id != 42 {
		t.Fatalf("valid ID rejected: %d %v", id, err)
	}
}
