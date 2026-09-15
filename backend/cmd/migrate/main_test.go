package main

import "testing"

func TestParseCommand(t *testing.T) {
	command, err := parseCommand([]string{"up", "--dir", "custom"})
	if err != nil {
		t.Fatal(err)
	}
	if command.Direction != "up" || command.Directory != "custom" {
		t.Fatalf("unexpected command: %#v", command)
	}
	legacy, err := parseCommand([]string{"--direction", "status", "--dir", "migrations"})
	if err != nil {
		t.Fatal(err)
	}
	if legacy.Direction != "status" {
		t.Fatalf("unexpected legacy command: %#v", legacy)
	}
}
