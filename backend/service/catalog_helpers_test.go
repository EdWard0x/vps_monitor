package service

import (
	"testing"

	"vpsmonitor/model/request"
)

func TestEditableVPSValidatesExactCatalogSemantics(t *testing.T) {
	valid := request.VPSEditable{
		MerchantID: "1", Code: "small", Name: "Small VPS", CPUCores: 1, MemoryMB: 1024,
		DiskGB: 0, DiskType: "ssd", HasIPv4: true, IPv4Count: 1,
		PriceAmount: "0.00000001", Currency: "usd", BillingPeriod: "monthly",
		PurchaseURL: "https://example.test/buy", Enabled: true,
	}
	row, err := editableVPS(valid)
	if err != nil {
		t.Fatal(err)
	}
	if row.Currency != "USD" || row.PriceAmount.String() != "0.00000001" {
		t.Fatalf("normalization failed: currency=%q price=%s", row.Currency, row.PriceAmount)
	}

	invalid := valid
	invalid.HasIPv4, invalid.IPv4Count = true, 0
	if _, err := editableVPS(invalid); err == nil {
		t.Fatal("enabled IPv4 with zero addresses must be rejected")
	}
	invalid = valid
	invalid.TransferGB = intPointer(-1)
	if _, err := editableVPS(invalid); err == nil {
		t.Fatal("negative transfer must be rejected")
	}
	invalid = valid
	invalid.PriceAmount = "1.000000000"
	if _, err := editableVPS(invalid); err == nil {
		t.Fatal("price precision beyond the database scale must be rejected")
	}
}

func intPointer(value int) *int { return &value }
