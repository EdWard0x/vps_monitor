package collect

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type MilliTimestamp time.Time
type Falresolverr struct {
	Status    string         `json:"status"`
	Message   string         `json:"message"`
	StartTime MilliTimestamp `json:"startTimestamp"`
	EndTime   MilliTimestamp `json:"endTimestamp"`
	Solution  struct {
		Url     string        `json:"url"`
		Status  int           `json:"status"`
		Cookies []interface{} `json:"cookies"`
		Ua      string        `json:"userAgent"`
		Res     string        `json:"response"`
	}
}

func (m *MilliTimestamp) UnmarshalJSON(b []byte) error {
	var ms int64
	if err := json.Unmarshal(b, &ms); err != nil {
		return err
	}
	*m = MilliTimestamp(time.UnixMilli(ms))
	return nil
}

func FlareRequest(ctx context.Context, sourceURL string, processorURL string, timeout int) (*Falresolverr, error) {
	payload := struct {
		Cmd        string `json:"cmd"`
		URL        string `json:"url"`
		MaxTimeout int    `json:"maxTimeout"`
	}{Cmd: "request.get", URL: sourceURL, MaxTimeout: timeout}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequest("GET", processorURL, bytes.NewBuffer(body))
	if err != nil {
		return nil, err
	}
	request = request.WithContext(ctx)
	request.Header.Set("Content-Type", "application/json")
	client := &http.Client{}
	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("processor returned status code %d", response.StatusCode)
	}
	var result Falresolverr
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		return nil, err
	}
	return &result, nil
}
