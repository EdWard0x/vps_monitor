// 业务错误码定义（与当前后端 model/errcode 和 docs/openapi.yaml 保持一致）

export const BusinessCode = {
  OK: 0,
  INVALID_ARGUMENT: 100001,
  RATE_LIMITED: 100003,
  CSRF_REJECTED: 100004,
  RESOURCE_NOT_FOUND: 100005,
  RESOURCE_CONFLICT: 100006,

  INVALID_CREDENTIALS: 200001,
  AUTH_REQUIRED: 200002,
  ACCESS_EXPIRED: 200003,
  USER_FROZEN: 200005,
  PERMISSION_DENIED: 200006,
  INVALID_TOKEN: 200009,
  MAIL_REQUIRED: 200011,
  MAIL_EXISTS: 200012,
  MAIL_CODE_INVALID: 200013,
  MAIL_UNAVAILABLE: 200014,
  MAIL_UNCHANGED: 200015,
  PASSWORD_RESET_INVALID: 200016,
  TOKEN_REVOKED: 200017,
  REGISTRATION_DISABLED: 200018,

  INVALID_USERNAME: 300001,
  USERNAME_EXISTS: 300002,
  VERIFY_PASSWORD_FAILED: 300003,

  DATABASE_ERROR: 400001,

  INTERNAL_ERROR: 900001,
  DEPENDENCY_UNAVAILABLE: 900004,
  NOT_IMPLEMENTED: 900005,
} as const;

export type BusinessCodeKey = keyof typeof BusinessCode;
export type BusinessCodeValue = (typeof BusinessCode)[BusinessCodeKey];

export const BusinessCodeMessages: Record<number, string> = {
  0: '操作成功',
  100001: '请求参数不合法',
  100003: '操作过于频繁，请稍后再试',
  100004: '请求验证失败，请刷新页面',
  100005: '资源不存在',
  100006: '资源冲突或仍被引用',

  200001: '用户名或密码错误，或账户不可用',
  200002: '请先登录',
  200003: '登录凭证已过期',
  200005: '账号已被冻结，请联系管理员',
  200006: '没有操作权限',
  200009: '登录凭证无效',
  200011: '管理员必须先绑定并验证邮箱',
  200012: '该邮箱不可用于绑定',
  200013: '验证码错误、过期或已失效',
  200014: '邮件服务暂不可用或发送失败',
  200015: '已绑定相同邮箱',
  200016: '重置请求或验证码错误、过期、已失效或账号状态已改变',
  200017: '登录凭证已失效，请重新登录',
  200018: '暂未开放注册',

  300001: '用户名格式不合法',
  300002: '用户名已被使用',
  300003: '当前密码错误',

  400001: '数据库操作失败，请稍后重试',

  900001: '服务暂时异常，请稍后重试',
  900004: '服务依赖暂不可用，请稍后重试',
  900005: '该功能尚未实现',
};
