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
	f, err := FlareRequest(ctx, r.SourceURL, r.ProcessorURL, 15000, c.Name())
	if err != nil {
		return collect.Observation{}, errcode.FlareResolveFailed
	}
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(f.Solution.Res))
	if err != nil {
		return collect.Observation{}, errcode.QueryHtmlFailed
	}
	main := doc.Find(".main-body")
	if main.Length() == 0 {
		return collect.Observation{}, errcode.QueryHtmlFailed
	}
	if main.Find(`.header-lined h1:contains("Out of Stock")`).Length() != 0 { //缺货提取
		q := 0
		return collect.Observation{Quantity: &q}, nil
	} else if main.Find(`.cart-step-text:contains("Choose Billing Cycle")`).Length() != 0 { //有货提取
		return collect.Observation{InStock: true}, nil
	}
	return collect.Observation{}, errcode.QueryHtmlFailed
}
