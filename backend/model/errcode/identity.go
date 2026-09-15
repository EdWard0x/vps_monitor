package errcode

import "net/http"

var RegistrationDisabled = &Error{200018, http.StatusForbidden, "注册暂未开放"}
