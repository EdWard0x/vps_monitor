package httpapi

import (
	"fmt"
	"github.com/gin-gonic/gin"
	"strconv"
	"time"
	"vpsmonitor/internal/application"
	"vpsmonitor/internal/platform/apperror"
	"vpsmonitor/internal/platform/pagination"
	"vpsmonitor/internal/platform/response"
)

// comments 允许公开阅读；发表和删除必须登录，“匿名发表”也要确定真实登录用户。
func (a *API) comments(v *gin.RouterGroup) {
	v.GET("/comments/:id", func(c *gin.Context) {
		id, e := application.ParseID(c.Param("id"))
		if fail(c, e) {
			return
		}
		x, e := a.S.Repo.GetComment(c, id)
		if fail(c, e) {
			return
		}
		response.Write(c, 200, commentPublic(x))
	})
	v.GET("/vps/:id/comments", a.listComments())
	v.GET("/vps/:id/comments/search", a.searchComments())
	v.POST("/vps/:id/comments", a.protected(false), a.rate("comment_user_minute", 5, time.Minute, true), a.rate("comment_user_day", 50, 24*time.Hour, true), a.rate("comment_ip", 20, time.Minute, false), func(c *gin.Context) {
		vpsID, e := application.ParseID(c.Param("id"))
		if fail(c, e) {
			return
		}
		var in struct {
			Content     string  `json:"content"`
			IsAnonymous bool    `json:"is_anonymous"`
			ParentID    *string `json:"parent_id"`
		}
		if e = bind(c, &in); fail(c, e) {
			return
		}
		var parent *int64
		if in.ParentID != nil {
			p, e := application.ParseID(*in.ParentID)
			if fail(c, e) {
				return
			}
			parent = &p
		}
		x, e := a.S.CreateComment(c, vpsID, user(c).ID, in.Content, in.IsAnonymous, parent)
		if fail(c, e) {
			return
		}
		response.Write(c, 201, commentPrivate(x))
	})
	v.DELETE("/comments/:id", a.protected(false), func(c *gin.Context) {
		id, e := application.ParseID(c.Param("id"))
		if fail(c, e) {
			return
		}
		if e = a.S.Repo.DeleteOwnComment(c, id, user(c).ID); fail(c, e) {
			return
		}
		response.Write(c, 200, nil)
	})
}

// listComments 每次只取根评论或某个父节点的直接回复，不一次返回整棵树。
// 根评论按新到旧排列，回复按旧到新排列，查询游标也跟随对应方向。
func (a *API) listComments() gin.HandlerFunc {
	return func(c *gin.Context) {
		vpsID, e := application.ParseID(c.Param("id"))
		if fail(c, e) {
			return
		}
		if _, e = a.S.Repo.GetVPS(c, vpsID, true); fail(c, e) {
			return
		}
		parent, e := parseOptionalID(c, "parent_id")
		if fail(c, e) {
			return
		}
		if parent != nil {
			x, e := a.S.Repo.GetComment(c, *parent)
			if fail(c, e) {
				return
			}
			if x.Comment.VPSID != vpsID {
				response.Error(c, apperror.ParentNotFound)
				return
			}
		}
		n, e := limit(c)
		if fail(c, e) {
			return
		}
		// scope 将游标绑定到套餐和父节点，不能拿 A 讨论串的翻页位置去翻 B 讨论串。
		scope := fmt.Sprintf("comments:%d:root", vpsID)
		root := parent == nil
		if parent != nil {
			scope = fmt.Sprintf("comments:%d:parent:%d", vpsID, *parent)
		}
		var after *time.Time
		var afterID int64
		if raw := c.Query("cursor"); raw != "" {
			x, e := a.S.Cursor.Decode(raw, scope)
			if fail(c, e) {
				return
			}
			after = &x.Time
			afterID = x.ID
		}
		// 多查一条判断是否还有下一页，实际最多返回 n 条。
		xs, e := a.S.Repo.ListComments(c, vpsID, parent, after, afterID, n+1, root)
		if fail(c, e) {
			return
		}
		more := len(xs) > n
		if more {
			xs = xs[:n]
		}
		items := make([]gin.H, len(xs))
		for i, x := range xs {
			items[i] = commentPublic(x)
		}
		var next any = nil
		if more && len(xs) > 0 {
			last := xs[len(xs)-1].Comment
			next = a.S.Cursor.Encode(pagination.Cursor{Scope: scope, Time: last.CreatedAt, ID: last.ID})
		}
		response.Write(c, 200, gin.H{"items": items, "next_cursor": next, "has_more": more})
	}
}

// searchComments 还把搜索词放入 scope；换关键词后必须从第一页开始。
func (a *API) searchComments() gin.HandlerFunc {
	return func(c *gin.Context) {
		vpsID, e := application.ParseID(c.Param("id"))
		if fail(c, e) {
			return
		}
		if _, e = a.S.Repo.GetVPS(c, vpsID, true); fail(c, e) {
			return
		}
		q := c.Query("q")
		if len([]rune(q)) < 2 || len([]rune(q)) > 100 {
			response.Error(c, apperror.InvalidArgument)
			return
		}
		n, e := limit(c)
		if fail(c, e) {
			return
		}
		scope := fmt.Sprintf("search:%d:%s", vpsID, q)
		var after *time.Time
		var afterID int64
		if raw := c.Query("cursor"); raw != "" {
			x, e := a.S.Cursor.Decode(raw, scope)
			if fail(c, e) {
				return
			}
			after = &x.Time
			afterID = x.ID
		}
		xs, e := a.S.Repo.SearchComments(c, vpsID, q, after, afterID, n+1)
		if fail(c, e) {
			return
		}
		more := len(xs) > n
		if more {
			xs = xs[:n]
		}
		items := make([]gin.H, len(xs))
		for i, x := range xs {
			d := commentPublic(x)
			root := x.Comment.ID
			if x.Comment.RootID != nil {
				root = *x.Comment.RootID
			}
			d["root_comment_id"] = strconv.FormatInt(root, 10)
			items[i] = d
		}
		var next any = nil
		if more && len(xs) > 0 {
			last := xs[len(xs)-1].Comment
			next = a.S.Cursor.Encode(pagination.Cursor{Scope: scope, Time: last.CreatedAt, ID: last.ID})
		}
		response.Write(c, 200, gin.H{"items": items, "next_cursor": next, "has_more": more})
	}
}
