package service

import (
	"testing"

	"golang.org/x/crypto/bcrypt"
)

func TestMailCodeHash(t *testing.T) {
	code, hash, err := newMailCode()
	if err != nil || !validMailCode(code) || hash == code || bcrypt.CompareHashAndPassword([]byte(hash), []byte(code)) != nil {
		t.Fatalf("invalid generated code: %v", err)
	}
	if !validMailCode("012345") || validMailCode("12345") || validMailCode("1234567") || validMailCode("12a456") {
		t.Fatal("code format validation failed")
	}
}
