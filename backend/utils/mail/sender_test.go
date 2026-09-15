package mail

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"io"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net"
	stdmail "net/mail"
	"net/textproto"
	"strconv"
	"strings"
	"testing"
	"time"

	"vpsmonitor/config"
	mailiface "vpsmonitor/iface/mail"
	"vpsmonitor/model/errcode"
)

func TestNormalizeAddress(t *testing.T) {
	got, err := NormalizeAddress("  John.Doe+monitor@EXAMPLE.com  ")
	if err != nil || got != "john.doe+monitor@example.com" {
		t.Fatalf("normalization=%q err=%v", got, err)
	}
	for _, address := range []string{"", "Name <user@example.com>", "first@example.com,second@example.com", "测试@example.com", "a@localhost", "a@.com", "a@example.", "a@-example.com", "a@exam_ple.com", "a\r\nb@example.com"} {
		if _, err := NormalizeAddress(address); err == nil {
			t.Fatalf("invalid email accepted: %q", address)
		}
	}
}

func TestBuildMessageUTF8AndHeaderInjection(t *testing.T) {
	message := mailiface.Message{To: []string{"接收人 <receiver@example.com>"}, Subject: "邮箱验证码", TextBody: "验证码为 012345", HTMLBody: "<p>验证码为 012345</p>"}
	from, recipients, data, err := buildMessage("VPS Monitor <sender@example.com>", message)
	if err != nil || from != "sender@example.com" || len(recipients) != 1 || recipients[0] != "receiver@example.com" {
		t.Fatalf("envelope: %q %v %v", from, recipients, err)
	}
	parsed, err := stdmail.ReadMessage(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	subject, err := (&mime.WordDecoder{}).DecodeHeader(parsed.Header.Get("Subject"))
	if err != nil || subject != message.Subject {
		t.Fatalf("subject=%q err=%v", subject, err)
	}
	kind, params, err := mime.ParseMediaType(parsed.Header.Get("Content-Type"))
	if err != nil || kind != "multipart/alternative" {
		t.Fatalf("kind=%q err=%v", kind, err)
	}
	reader := multipart.NewReader(parsed.Body, params["boundary"])
	for _, expected := range []string{message.TextBody, message.HTMLBody} {
		part, err := reader.NextRawPart()
		if err != nil {
			t.Fatal(err)
		}
		body, err := io.ReadAll(quotedprintable.NewReader(part))
		if err != nil || string(body) != expected {
			t.Fatalf("body=%q err=%v", body, err)
		}
	}
	for _, unsafe := range []mailiface.Message{
		{To: []string{"ok@example.com"}, Subject: "hello\r\nBcc: victim@example.com"},
		{To: []string{"ok@example.com\r\nBcc: victim@example.com"}},
		{To: []string{"bad-address"}},
		{},
	} {
		if _, _, _, err := buildMessage("sender@example.com", unsafe); !errors.Is(err, errcode.InvalidArgument) {
			t.Fatalf("unsafe message accepted: %+v", unsafe)
		}
	}
}

func TestSenderSMTPConversation(t *testing.T) {
	listener, cfg := localSMTP(t)
	result := make(chan string, 1)
	errors := make(chan error, 1)
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			errors <- err
			return
		}
		defer conn.Close()
		wire := textproto.NewConn(conn)
		_ = wire.PrintfLine("220 localhost ESMTP")
		for {
			line, err := wire.ReadLine()
			if err != nil {
				errors <- err
				return
			}
			switch {
			case strings.HasPrefix(line, "EHLO"), strings.HasPrefix(line, "HELO"), strings.HasPrefix(line, "MAIL FROM:"), strings.HasPrefix(line, "RCPT TO:"):
				_ = wire.PrintfLine("250 OK")
			case line == "DATA":
				_ = wire.PrintfLine("354 send message")
				data, err := wire.ReadDotBytes()
				if err != nil {
					errors <- err
					return
				}
				result <- string(data)
				_ = wire.PrintfLine("250 accepted")
			case line == "QUIT":
				_ = wire.PrintfLine("221 bye")
				errors <- nil
				return
			default:
				_ = wire.PrintfLine("500 unsupported")
			}
		}
	}()
	if err := New(cfg).Send(context.Background(), mailiface.Message{To: []string{"receiver@example.com"}, Subject: "code", TextBody: "012345"}); err != nil {
		t.Fatal(err)
	}
	if err := <-errors; err != nil {
		t.Fatal(err)
	}
	if body := <-result; !strings.Contains(body, "012345") || !strings.Contains(body, "To: <receiver@example.com>") {
		t.Fatalf("unexpected SMTP content: %q", body)
	}
}

func TestSenderRequiresSTARTTLS(t *testing.T) {
	listener, cfg := localSMTP(t)
	cfg.TLSMode = "starttls"
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		wire := textproto.NewConn(conn)
		_ = wire.PrintfLine("220 localhost ESMTP")
		_, _ = wire.ReadLine()
		_ = wire.PrintfLine("250 localhost")
		_, _ = io.Copy(io.Discard, conn)
	}()
	err := New(cfg).Send(context.Background(), mailiface.Message{To: []string{"receiver@example.com"}, TextBody: "code"})
	if err == nil || !strings.Contains(err.Error(), "required STARTTLS") {
		t.Fatalf("unencrypted SMTP accepted: %v", err)
	}
}

func TestSenderCancellationAndDisabled(t *testing.T) {
	listener, cfg := localSMTP(t)
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		_, _ = bufio.NewReader(conn).ReadByte()
	}()
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	start := time.Now()
	if err := New(cfg).Send(ctx, mailiface.Message{To: []string{"receiver@example.com"}, TextBody: "code"}); err == nil || time.Since(start) > time.Second {
		t.Fatalf("cancellation was not applied: %v", err)
	}
	cfg.Enabled = false
	if err := New(cfg).Send(context.Background(), mailiface.Message{}); !errors.Is(err, errcode.MailUnavailable) {
		t.Fatalf("disabled SMTP=%v", err)
	}
}

func localSMTP(t *testing.T) (net.Listener, config.Mail) {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = listener.Close() })
	host, portValue, _ := net.SplitHostPort(listener.Addr().String())
	port, _ := strconv.Atoi(portValue)
	return listener, config.Mail{Enabled: true, Host: host, Port: port, From: "sender@example.com", TLSMode: "none", Timeout: 2 * time.Second}
}
