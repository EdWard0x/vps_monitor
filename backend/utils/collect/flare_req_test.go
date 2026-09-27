package collect

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/PuerkitoBio/goquery"
)

func TestFlareRequest(t *testing.T) {
	f, err := FlareRequest(context.Background(), "https://www.akkocloud.com/aff.php?aff=2519&pid=175", "http://localhost:8191/v1", 30000, "Akko Collector")
	if err != nil {
		return
	}
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(f.Solution.Res))
	if err != nil {
		return
	}
	if doc.Find(`#order-boxes .header-lined h1:contains("缺货")`).Length() != 0 { //缺货提取
		fmt.Println("no")
	} else if doc.Find(`#frmConfigureProduct .form-group:contains("付款周期")`).Length() != 0 { //有货提取
		fmt.Println("yes")
	}
	return
}
