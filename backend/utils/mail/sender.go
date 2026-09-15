package mail

import (
	"bytes"
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net"
	"net/mail"
	"net/smtp"
	"net/textproto"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"vpsmonitor/config"
	mailiface "vpsmonitor/iface/mail"
	"vpsmonitor/model/errcode"
)

// Sender 同步发送事务邮件，TLS 校验证书并为整个连接设置截止时间。
type Sender struct{ Config config.Mail }

func New(cfg config.Mail) *Sender { return &Sender{Config: cfg} }

func (s Sender) Ready() error {
	cfg := s.Config
	if !cfg.Enabled || strings.TrimSpace(cfg.Host) == "" || cfg.Port < 1 || cfg.Port > 65535 || cfg.Timeout <= 0 {
		return errcode.MailUnavailable
	}
	if cfg.TLSMode != "starttls" && cfg.TLSMode != "tls" && cfg.TLSMode != "none" {
		return errcode.MailUnavailable
	}
	if _, err := mail.ParseAddress(cfg.From); err != nil || strings.ContainsAny(cfg.From, "\r\n") {
		return errcode.MailUnavailable
	}
	return nil
}

func (s Sender) Send(ctx context.Context, message mailiface.Message) error {
	if err := s.Ready(); err != nil {
		return err
	}
	from, recipients, content, err := buildMessage(s.Config.From, message)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, s.Config.Timeout)
	defer cancel()
	dialer := &net.Dialer{Timeout: s.Config.Timeout}
	address := net.JoinHostPort(s.Config.Host, strconv.Itoa(s.Config.Port))
	conn, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		return fmt.Errorf("smtp connect: %w", err)
	}
	defer conn.Close()
	rawConn := conn
	stop := context.AfterFunc(ctx, func() { _ = rawConn.Close() })
	defer stop()
	if deadline, ok := ctx.Deadline(); ok {
		if err := conn.SetDeadline(deadline); err != nil {
			return fmt.Errorf("smtp deadline: %w", err)
		}
	}
	tlsConfig := &tls.Config{ServerName: s.Config.Host, MinVersion: tls.VersionTLS12}
	if s.Config.TLSMode == "tls" {
		tlsConn := tls.Client(conn, tlsConfig)
		if err := tlsConn.HandshakeContext(ctx); err != nil {
			return fmt.Errorf("smtp tls: %w", err)
		}
		conn = tlsConn
	}
	client, err := smtp.NewClient(conn, s.Config.Host)
	if err != nil {
		return fmt.Errorf("smtp greeting: %w", err)
	}
	defer client.Close()
	if s.Config.TLSMode == "starttls" {
		if ok, _ := client.Extension("STARTTLS"); !ok {
			return fmt.Errorf("smtp server does not support required STARTTLS")
		}
		if err := client.StartTLS(tlsConfig); err != nil {
			return fmt.Errorf("smtp starttls: %w", err)
		}
	}
	if s.Config.Username != "" {
		if err := client.Auth(smtp.PlainAuth("", s.Config.Username, s.Config.Password, s.Config.Host)); err != nil {
			return fmt.Errorf("smtp authenticate: %w", err)
		}
	}
	if err := client.Mail(from); err != nil {
		return fmt.Errorf("smtp sender: %w", err)
	}
	for _, recipient := range recipients {
		if err := client.Rcpt(recipient); err != nil {
			return fmt.Errorf("smtp recipient: %w", err)
		}
	}
	writer, err := client.Data()
	if err != nil {
		return fmt.Errorf("smtp data: %w", err)
	}
	if _, err := writer.Write(content); err != nil {
		_ = writer.Close()
		return fmt.Errorf("smtp write: %w", err)
	}
	if err := writer.Close(); err != nil {
		return fmt.Errorf("smtp delivery: %w", err)
	}
	// DATA 的成功响应才是投递已被 SMTP 接受；QUIT 失败不把已接收邮件误报为失败。
	_ = client.Quit()
	return nil
}

func buildMessage(fromValue string, message mailiface.Message) (string, []string, []byte, error) {
	if strings.ContainsAny(fromValue+message.Subject, "\r\n") || len(message.To) == 0 {
		return "", nil, nil, errcode.InvalidArgument
	}
	from, err := mail.ParseAddress(fromValue)
	if err != nil {
		return "", nil, nil, errcode.InvalidArgument
	}
	recipients := make([]string, 0, len(message.To))
	toHeaders := make([]string, 0, len(message.To))
	for _, value := range message.To {
		address, err := mail.ParseAddress(value)
		if err != nil || strings.ContainsAny(value, "\r\n") {
			return "", nil, nil, errcode.InvalidArgument
		}
		recipients = append(recipients, address.Address)
		toHeaders = append(toHeaders, address.String())
	}
	var content bytes.Buffer
	fmt.Fprintf(&content, "From: %s\r\nTo: %s\r\nSubject: %s\r\nDate: %s\r\nMessage-ID: <%s@vpsmonitor>\r\nMIME-Version: 1.0\r\n", from.String(), strings.Join(toHeaders, ", "), mime.QEncoding.Encode("UTF-8", message.Subject), time.Now().UTC().Format(time.RFC1123Z), uuid.NewString())
	if message.HTMLBody == "" || message.TextBody == "" {
		body, contentType := message.TextBody, "text/plain"
		if message.HTMLBody != "" {
			body, contentType = message.HTMLBody, "text/html"
		}
		fmt.Fprintf(&content, "Content-Type: %s; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n", contentType)
		if err := writeBody(&content, body); err != nil {
			return "", nil, nil, err
		}
	} else {
		multi := multipart.NewWriter(&content)
		fmt.Fprintf(&content, "Content-Type: multipart/alternative; boundary=%q\r\n\r\n", multi.Boundary())
		for _, part := range []struct{ contentType, body string }{{"text/plain", message.TextBody}, {"text/html", message.HTMLBody}} {
			header := textproto.MIMEHeader{}
			header.Set("Content-Type", part.contentType+"; charset=UTF-8")
			header.Set("Content-Transfer-Encoding", "quoted-printable")
			writer, err := multi.CreatePart(header)
			if err != nil {
				return "", nil, nil, err
			}
			if err := writeBody(writer, part.body); err != nil {
				return "", nil, nil, err
			}
		}
		if err := multi.Close(); err != nil {
			return "", nil, nil, err
		}
	}
	return from.Address, recipients, content.Bytes(), nil
}

// NormalizeAddress 保留本地部分的点和 plus tag，仅接受单个 ASCII 地址并统一小写。
func NormalizeAddress(raw string) (string, error) {
	value := strings.ToLower(strings.TrimSpace(raw))
	if len(value) == 0 || len(value) > 254 || strings.ContainsAny(value, "\r\n\t \"<>(),;\\") {
		return "", errcode.InvalidArgument
	}
	for _, r := range value {
		if r > 127 || r < 33 {
			return "", errcode.InvalidArgument
		}
	}
	address, err := mail.ParseAddress(value)
	if err != nil || address.Address != value {
		return "", errcode.InvalidArgument
	}
	parts := strings.Split(value, "@")
	if len(parts) != 2 || len(parts[0]) > 64 || !strings.Contains(parts[1], ".") {
		return "", errcode.InvalidArgument
	}
	for _, label := range strings.Split(parts[1], ".") {
		if len(label) == 0 || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
			return "", errcode.InvalidArgument
		}
		for _, r := range label {
			if !(r >= 'a' && r <= 'z') && !(r >= '0' && r <= '9') && r != '-' {
				return "", errcode.InvalidArgument
			}
		}
	}
	return value, nil
}

func writeBody(writer io.Writer, body string) error {
	encoded := quotedprintable.NewWriter(writer)
	if _, err := encoded.Write([]byte(body)); err != nil {
		return err
	}
	return encoded.Close()
}
