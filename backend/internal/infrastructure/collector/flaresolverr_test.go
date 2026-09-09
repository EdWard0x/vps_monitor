package collector

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

// 用临时服务验证处理器请求，不访问真实网站。
func TestHttpreqWithProcessor(t *testing.T) {
	var directCalls atomic.Int32
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		directCalls.Add(1)
		fmt.Fprint(w, "unexpected direct request")
	}))
	defer target.Close()
	// 引号和 & 验证目标 URL 经 JSON 编码传递，而非拼接出无效 JSON。
	destURL := target.URL + `/product?q="example"&id=101`
	const html = "<h1>Out of Stock</h1>"
	processor := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("unexpected request: method=%s content-type=%s", r.Method, r.Header.Get("Content-Type"))
		}
		var payload struct {
			Cmd        string `json:"cmd"`
			URL        string `json:"url"`
			MaxTimeout int    `json:"maxTimeout"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Errorf("invalid JSON: %v", err)
			http.Error(w, "invalid JSON", 400)
			return
		}
		if payload.Cmd != "request.get" || payload.URL != destURL || payload.MaxTimeout != 5000 {
			t.Errorf("unexpected payload: %+v", payload)
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"status":"ok","startTimestamp":1000,"endTimestamp":2000,"solution":{"status":200,"response":"<h1>Out of Stock</h1>"}}`)
	}))
	defer processor.Close()
	result, err := Httpreq(destURL, processor.URL)
	if err != nil {
		t.Fatal(err)
	}
	if result.Solution.Res != html || time.Time(result.StartTime).UnixMilli() != 1000 {
		t.Fatalf("unexpected processor response: %+v", result)
	}
	if directCalls.Load() != 0 {
		t.Fatal("processor mode requested target directly")
	}
}
