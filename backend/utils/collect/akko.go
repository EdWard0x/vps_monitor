package collect

import (
	"context"
	"strings"
	"vpsmonitor/iface/collect"
	"vpsmonitor/model/errcode"

	"github.com/PuerkitoBio/goquery"
)

type AkkoCollector struct{ Enabled bool }

func (c AkkoCollector) Code() string    { return "akko" }
func (c AkkoCollector) Name() string    { return "Akko Collector" }
func (c AkkoCollector) Available() bool { return c.Enabled }
func (c AkkoCollector) Collect(ctx context.Context, r collect.CollectRequest) (collect.Observation, error) {
	if !c.Enabled {
		return collect.Observation{}, nil
	}
	f, err := FlareRequest(ctx, r.SourceURL, r.ProcessorURL, 10000, c.Name())
	if err != nil {
		return collect.Observation{}, err
	}
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(f.Solution.Res))
	if err != nil {
		return collect.Observation{}, err
	}
	if doc.Find(`.header-lined h1:contains("缺货")`).Length() != 0 { //缺货提取
		q := 0
		return collect.Observation{Quantity: &q}, nil
	} else if doc.Find(`#frmConfigureProduct label:contains("付款周期")`).Length() != 0 { //有货提取
		return collect.Observation{}, nil
	}
	return collect.Observation{}, errcode.QueryHtmlFailed
}
