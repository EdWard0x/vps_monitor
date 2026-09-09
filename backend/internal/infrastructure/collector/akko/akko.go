package akko

import (
	"context"
	"strings"
	"vpsmonitor/internal/domain"
	"vpsmonitor/internal/infrastructure/collector"
	"vpsmonitor/internal/ports"

	"github.com/PuerkitoBio/goquery"
)

type Collector struct{ Enabled bool }

func (c Collector) Code() string    { return "akko" }
func (c Collector) Name() string    { return "Akko Collector" }
func (c Collector) Available() bool { return c.Enabled }
func (c Collector) Collect(ctx context.Context, r ports.CollectRequest) (domain.Observation, error) {
	if !c.Enabled {
		return domain.Observation{Status: 3, ErrorCode: "SOURCE_URL_REJECTED"}, nil
	}
	f, err := collector.Httpreq(r.SourceURL, r.ProcessorURL, 10000)
	if err != nil {
		return domain.Observation{}, err
	}
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(f.Solution.Res))
	if err != nil {
		return domain.Observation{}, err
	}
	outof_stock := doc.Find("#order-boxes .header-lined h1")
	if outof_stock.Length() != 0 {
		text := strings.TrimSpace(outof_stock.Text())
		if text == "缺货" {
			q := 0
			return domain.Observation{Status: 2, Quantity: &q}, nil
		}
		return domain.Observation{}, nil
	}
	has_stock_title := doc.Find("#orderSummary .order-summary h2")
	if has_stock_title.Length() != 0 {
		text := strings.TrimSpace(has_stock_title.Text())
		if text == "订购总额" {
			return domain.Observation{Status: 1}, nil
		}
		return domain.Observation{}, nil
	}
	return domain.Observation{}, nil
}
