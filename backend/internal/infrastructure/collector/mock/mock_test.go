package mock

import (
	"context"
	"testing"
	"vpsmonitor/internal/ports"
)

func TestDeterministicScenarios(t *testing.T) {
	c := Collector{Enabled: true}
	cases := map[string]int16{"demo-lax-mini": 1, "demo-hkg-standard": 2, "demo-tyo-pro": 3, "other": 3}
	for code, want := range cases {
		o, e := c.Collect(context.Background(), ports.CollectRequest{Code: code})
		if e != nil || o.Status != want {
			t.Fatalf("%s got %d %v", code, o.Status, e)
		}
	}
}
