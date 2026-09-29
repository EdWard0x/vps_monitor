package service

import (
	"context"
	"errors"
	"strings"
	"testing"

	"vpsmonitor/model/errcode"
)

func TestNormalizeServerKey(t *testing.T) {
	for _, input := range []string{"", " \t\n", "{key}", " {key} ", "key with space", "key\nvalue", "key\x00value", "key\u2003value", strings.Repeat("a", 65), string([]byte{0xff})} {
		if _, err := normalizeServerKey(input); !errors.Is(err, errcode.InvalidArgument) {
			t.Errorf("invalid key accepted: %q", input)
		}
	}
	for _, input := range []string{"application-key", "SCT-test-key", strings.Repeat("a", 64)} {
		got, err := normalizeServerKey(" \t" + input + "\n")
		if err != nil || got != input {
			t.Errorf("valid key rejected or altered: %q, %v", got, err)
		}
	}
}

func TestNoticeServiceWithoutDatabase(t *testing.T) {
	s := NewNoticeService(nil, nil)
	ctx := context.Background()
	_, getErr := s.GetNotice(ctx, "1")
	_, bindErr := s.BindServerKey(ctx, "1", "application-key")
	_, checkErr := s.CheckServerKey(ctx, "1")
	for _, err := range []error{getErr, bindErr, checkErr, s.TestNotice(ctx, "1"), s.AddNotices(ctx, "1"), s.DelNotices(ctx, "1")} {
		if !errors.Is(err, errcode.NotImplemented) {
			t.Fatalf("missing database must fail safely, got %v", err)
		}
	}
}
