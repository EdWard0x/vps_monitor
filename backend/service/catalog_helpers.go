package service

import (
	"errors"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"
	"vpsmonitor/model/entity"
	"vpsmonitor/model/errcode"
	"vpsmonitor/model/response"
)

// StockStaleAfter 是展示层的新鲜度阈值，不触发采集或修改库存。
const StockStaleAfter = 15 * time.Minute

var catalogCodePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{0,63}$`)
var catalogCurrencyPattern = regexp.MustCompile(`^[A-Z]{3}$`)
var catalogPricePattern = regexp.MustCompile(`^[0-9]{1,12}(\.[0-9]{1,8})?$`)

func parseCatalogID(value string) (uint, error) {
	if value == "" || strings.Trim(value, "0123456789") != "" {
		return 0, errcode.InvalidArgument
	}
	id, err := strconv.ParseUint(value, 10, 63)
	if err != nil || id == 0 || uint64(uint(id)) != id {
		return 0, errcode.InvalidArgument
	}
	return uint(id), nil
}

func catalogID(id uint) string { return strconv.FormatUint(uint64(id), 10) }

func catalogText(value string, maximum int) bool {
	return value != "" && utf8.RuneCountInString(value) <= maximum
}

func catalogURL(value string) bool {
	if len(value) > 4096 {
		return false
	}
	u, err := url.ParseRequestURI(value)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Hostname() != "" && u.User == nil
}

func catalogDBError(err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return errcode.ResourceNotFound
	}
	var pgErr *pgconn.PgError
	if errors.Is(err, gorm.ErrDuplicatedKey) || (errors.As(err, &pgErr) && pgErr.Code == "23505") {
		return errcode.ResourceConflict
	}
	return errcode.DatabaseError
}

// Escape LIKE 通配符，使搜索关键词中的 % 和 _ 保持字面含义。
func catalogSearch(value string) string {
	return "%" + strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(strings.ToLower(strings.TrimSpace(value))) + "%"
}

func publicMerchant(row entity.Merchant) response.Merchant {
	return response.Merchant{ID: catalogID(row.ID), Code: row.Code, Name: row.Name, WebsiteURL: row.WebsiteURL}
}

func adminMerchant(row entity.Merchant) response.AdminMerchant {
	return response.AdminMerchant{
		Merchant: publicMerchant(row), Enabled: row.Enabled, CollectionEnabled: row.CollectionEnabled,
		CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
	}
}

func currentStock(vpsID uint, row *entity.Stock, now time.Time) response.Stock {
	out := response.Stock{VPSID: catalogID(vpsID), Status: 3, IsStale: true}
	if row == nil {
		return out
	}
	out.Status, out.Quantity = row.Status, row.Quantity
	out.LastCheckedAt, out.LastInStockAt = row.LastCheckedAt, row.LastInStockAt
	out.IsStale = row.LastCheckedAt == nil || now.Sub(*row.LastCheckedAt) > StockStaleAfter
	return out
}

func publicVPS(row entity.VPS, merchant entity.Merchant, stock *entity.Stock, now time.Time) response.VPS {
	return response.VPS{
		ID: catalogID(row.ID), Merchant: publicMerchant(merchant), Code: row.Code, Name: row.Name,
		Description: row.Description, CPUCores: row.CPUCores, MemoryMB: row.MemoryMB,
		DiskGB: row.DiskGB, DiskType: row.DiskType, TransferGB: row.TransferGB, PortMbps: row.PortMbps,
		HasIPv4: row.HasIPv4, IPv4Count: row.IPv4Count, HasIPv6: row.HasIPv6, IPv6Count: row.IPv6Count,
		PriceAmount: row.PriceAmount.String(), Currency: row.Currency, BillingPeriod: row.BillingPeriod,
		PurchaseURL: row.PurchaseURL, Stock: currentStock(row.ID, stock, now),
		CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
	}
}
