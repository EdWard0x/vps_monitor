package collect

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	collectiface "vpsmonitor/iface/collect"
	"vpsmonitor/model/errcode"
)

func TestCollectorsStockObservation(t *testing.T) {
	for _, tc := range []struct {
		name      string
		collector collectiface.Collector
		html      string
		inStock   bool
		outStock  bool
		wantError bool
	}{
		{"akko in stock", AkkoCollector{Enabled: true}, `<form id="frmConfigureProduct"><label>付款周期</label></form>`, true, false, false},
		{"akko out of stock", AkkoCollector{Enabled: true}, `<div class="header-lined"><h1>缺货</h1></div>`, false, true, false},
		{"akko unknown page", AkkoCollector{Enabled: true}, `<html>unexpected page</html>`, false, false, true},
		{"dmit in stock", DmitCollector{Enabled: true}, `<div class="main-body"><div class="cart-step-text">Choose Billing Cycle</div></div>`, true, false, false},
		{"dmit out of stock", DmitCollector{Enabled: true}, `<div class="main-body"><div class="header-lined"><h1>Out of Stock</h1></div></div>`, false, true, false},
		{"dmit unknown page", DmitCollector{Enabled: true}, `<div class="main-body">unexpected page</div>`, false, false, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_ = json.NewEncoder(w).Encode(map[string]any{
					"status": "ok", "solution": map[string]any{"status": 200, "response": tc.html},
				})
			}))
			defer server.Close()
			got, err := tc.collector.Collect(context.Background(), collectiface.CollectRequest{
				SourceURL: "https://example.test/product", ProcessorURL: server.URL,
			})
			if tc.wantError {
				if !errors.Is(err, errcode.QueryHtmlFailed) || got.InStock {
					t.Fatalf("unexpected page must not report stock: got=%+v err=%v", got, err)
				}
				return
			}
			if err != nil || got.InStock != tc.inStock {
				t.Fatalf("got=%+v err=%v", got, err)
			}
			if tc.outStock {
				if got.Quantity == nil || *got.Quantity != 0 {
					t.Fatal("out of stock must have quantity=0")
				}
			} else if got.Quantity != nil {
				t.Fatal("in stock with unknown quantity must keep quantity=nil")
			}
		})
	}
}
