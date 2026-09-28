package collect

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type deadlineTransport struct{ requestContext context.Context }

func (d *deadlineTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	d.requestContext = r.Context()
	return &http.Response{
		StatusCode: http.StatusOK, Header: make(http.Header),
		Body: io.NopCloser(strings.NewReader(`{"status":"ok","solution":{"response":"test"}}`)),
	}, nil
}

func TestFlareRequestDeadline(t *testing.T) {
	transport := &deadlineTransport{}
	original := http.DefaultTransport
	http.DefaultTransport = transport
	t.Cleanup(func() { http.DefaultTransport = original })
	start := time.Now()
	_, err := FlareRequest(context.Background(), "https://example.test", "http://processor.test", 10000, "test")
	if err != nil {
		t.Fatal(err)
	}
	deadline, ok := transport.requestContext.Deadline()
	if !ok || deadline.Before(start.Add(11*time.Second)) || deadline.After(time.Now().Add(11*time.Second)) {
		t.Fatalf("expected an 11-second deadline on the HTTP request, got %v", deadline)
	}
	if !errors.Is(transport.requestContext.Err(), context.Canceled) {
		t.Fatal("request context must be cancelled after completion")
	}
}
