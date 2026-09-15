package api

import (
	"github.com/gin-gonic/gin"
	"math"
	"net/http"
	"time"
	"vpsmonitor/model/errcode"
	"vpsmonitor/model/request"
	"vpsmonitor/model/response"
	"vpsmonitor/service"
)

type CookieOptions struct {
	Name   string
	MaxAge int
	Secure bool
}

type AuthApi struct {
	Service       *service.AuthService
	CSRFCookie    CookieOptions
	RefreshCookie CookieOptions
}

func (a AuthApi) Register(c *gin.Context) {
	var in request.Register
	if !bindJSON(c, &in) {
		return
	}
	out, err := a.Service.Register(c.Request.Context(), in)
	if err != nil {
		response.Error(c, err)
		return
	}
	ok(c, out)
}
func (a AuthApi) Login(c *gin.Context) {
	var in request.Login
	if !bindJSON(c, &in) {
		return
	}
	out, credential, err := a.Service.Login(c.Request.Context(), in)
	if err != nil {
		response.Error(c, err)
		return
	}
	if err := a.setRefreshCookie(c, credential); err != nil {
		response.Error(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	ok(c, out)
}
func (a AuthApi) Refresh(c *gin.Context) {
	raw, _ := c.Cookie(a.RefreshCookie.Name)
	out, credential, err := a.Service.Refresh(c.Request.Context(), raw)
	if err != nil {
		response.Error(c, err)
		return
	}
	if err := a.setRefreshCookie(c, credential); err != nil {
		response.Error(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	ok(c, out)
}
func (a AuthApi) Logout(c *gin.Context) {
	if err := a.Service.Logout(c.Request.Context()); err != nil {
		response.Error(c, err)
		return
	}
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(a.RefreshCookie.Name, "", -1, "/", "", a.RefreshCookie.Secure, true)
	noContentData(c)
}
func (a AuthApi) IssueCSRF(c *gin.Context) {
	existingToken, _ := c.Cookie(a.CSRFCookie.Name)
	out, err := a.Service.IssueCSRF(c.Request.Context(), existingToken)
	if err != nil {
		response.Error(c, err)
		return
	}
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(a.CSRFCookie.Name, out.Token, a.CSRFCookie.MaxAge, "/", "", a.CSRFCookie.Secure, true)
	c.Header("Cache-Control", "no-store")
	response.Success(c, http.StatusOK, out)
}

func (a AuthApi) setRefreshCookie(c *gin.Context, credential service.RefreshCredential) error {
	maxAge := int(math.Ceil(time.Until(credential.ExpiresAt).Seconds()))
	if maxAge <= 0 {
		return errcode.InvalidToken
	}
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(a.RefreshCookie.Name, credential.Token, maxAge, "/", "", a.RefreshCookie.Secure, true)
	return nil
}
