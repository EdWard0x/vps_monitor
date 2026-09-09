package collector

import (
	"bytes"
	"encoding/json"
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

// Httpreq 把目标网址交给本地处理器，请处理器获取网页。
func Httpreq(destURL, processorURL string, MaxTimeout int) (*Falresolverr, error) {
	payload := struct {
		Cmd        string `json:"cmd"`
		URL        string `json:"url"`
		MaxTimeout int    `json:"maxTimeout"`
	}{Cmd: "request.get", URL: destURL, MaxTimeout: MaxTimeout}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	request, err := http.NewRequest(http.MethodPost, processorURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	var result Falresolverr
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (m *MilliTimestamp) UnmarshalJSON(b []byte) error {
	var ms int64
	if err := json.Unmarshal(b, &ms); err != nil {
		return err
	}
	*m = MilliTimestamp(time.UnixMilli(ms))
	return nil
}
