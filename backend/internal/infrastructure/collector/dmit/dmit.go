package dmit

import (
	"context"
	"strings"
	"vpsmonitor/internal/domain"
	"vpsmonitor/internal/infrastructure/collector"
	"vpsmonitor/internal/ports"

	"github.com/PuerkitoBio/goquery"
)

type Collector struct{ Enabled bool }

func (c Collector) Code() string    { return "dmit" }
func (c Collector) Name() string    { return "Dmit Collector" }
func (c Collector) Available() bool { return c.Enabled }
func (c Collector) Collect(ctx context.Context, r ports.CollectRequest) (domain.Observation, error) {
	if !c.Enabled {
		return domain.Observation{Status: 3, ErrorCode: "SOURCE_URL_REJECTED"}, nil
	}
	f, err := collector.Httpreq(r.SourceURL, r.ProcessorURL, 8000)
	if err != nil {
		return domain.Observation{}, err
	}
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(f.Solution.Res))
	if err != nil {
		return domain.Observation{}, err
	}
	title := doc.Find("#order-boxes .header-lined h1")
	if title.Length() == 0 {
		return domain.Observation{Status: 3, ErrorCode: "PARSE_UNRECOGNIZED"}, nil
	}
	text := strings.TrimSpace(title.Text())
	if text == "Out of Stock" {
		q := 0
		return domain.Observation{Status: 2, Quantity: &q}, nil
	}
	return domain.Observation{}, nil
}
