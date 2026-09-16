package collect

import (
	"context"
	"strings"
	"vpsmonitor/iface/collect"

	"github.com/PuerkitoBio/goquery"
)

type DmitCollector struct{ Enabled bool }

func (c DmitCollector) Code() string    { return "dmit" }
func (c DmitCollector) Name() string    { return "Dmit Collector" }
func (c DmitCollector) Available() bool { return c.Enabled }
func (c DmitCollector) Collect(ctx context.Context, r collect.CollectRequest) (collect.Observation, error) {
	if !c.Enabled {
		return collect.Observation{}, nil
	}
	f, err := FlareRequest(ctx, r.SourceURL, r.ProcessorURL, 8000)
	if err != nil {
		return collect.Observation{}, err
	}
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(f.Solution.Res))
	if err != nil {
		return collect.Observation{}, err
	}
	title := doc.Find("#order-boxes .header-lined h1")
	if title.Length() == 0 {
		return collect.Observation{}, nil
	}
	text := strings.TrimSpace(title.Text())
	if text == "Out of Stock" {
		q := 0
		return collect.Observation{Quantity: &q}, nil
	}
	return collect.Observation{}, nil
}
