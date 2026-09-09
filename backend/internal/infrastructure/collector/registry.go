package collector

import (
	"sort"
	"vpsmonitor/internal/ports"
)

// Registry 按 code 查找采集器，Worker 不需要写一长串商家判断分支。
// 启动时填充、运行时读取；List 额外排序，避免 map 遍历顺序让接口结果随机变化。
type Registry struct{ items map[string]ports.Collector }

func New(cs ...ports.Collector) *Registry {
	r := &Registry{items: map[string]ports.Collector{}}
	for _, c := range cs {
		r.items[c.Code()] = c
	}
	return r
}
func (r *Registry) Get(code string) (ports.Collector, bool) { c, ok := r.items[code]; return c, ok }
func (r *Registry) List() []ports.Collector {
	out := make([]ports.Collector, 0, len(r.items))
	for _, c := range r.items {
		out = append(out, c)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Code() < out[j].Code() })
	return out
}
