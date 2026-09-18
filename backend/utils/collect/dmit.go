package collect

import (
	"context"
	"strings"
	"vpsmonitor/iface/collect"
	"vpsmonitor/model/errcode"

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
	f, err := FlareRequest(ctx, r.SourceURL, r.ProcessorURL, 10000)
	if err != nil {
		return collect.Observation{}, errcode.FlareResolveFailed
	}
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(f.Solution.Res))
	if err != nil {
		return collect.Observation{}, errcode.QueryHtmlFailed
	}
	title := doc.Find("#order-boxes .header-lined h1")
	if title.Length() == 0 {
		return collect.Observation{}, errcode.QueryHtmlFailed
	}
	text := strings.TrimSpace(title.Text())
	if text == "Out of Stock" {
		q := 0
		return collect.Observation{Quantity: &q}, nil
	}
	return collect.Observation{}, nil
}
