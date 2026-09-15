package errcode

import (
	"errors"
	"net/http"
	"testing"
)

func TestRequiredMappings(t *testing.T) {
	cases := []struct {
		err          error
		code, status int
	}{{NotImplemented, 900005, http.StatusNotImplemented}, {UserFrozen, 200005, http.StatusForbidden}, {TokenRevoked, 200017, http.StatusUnauthorized}, {errors.New("internal"), 900004, http.StatusServiceUnavailable}}
	for _, tc := range cases {
		got := Resolve(tc.err)
		if got.Code != tc.code || got.HTTPStatus != tc.status {
			t.Fatalf("got %d/%d", got.Code, got.HTTPStatus)
		}
	}
}
