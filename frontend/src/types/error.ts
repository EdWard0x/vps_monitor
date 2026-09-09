// 业务错误码定义（与 docs/05-errors-and-common.md 严格保持一致）

export const BusinessCode = {
  OK: 0,
  INVALID_ARGUMENT: 100001,
  INVALID_JSON: 100002,
  RATE_LIMITED: 100003,
  CSRF_REJECTED: 100004,
  RESOURCE_NOT_FOUND: 100005,
  BODY_TOO_LARGE: 100006,
  UNSUPPORTED_MEDIA_TYPE: 100007,

  INVALID_CREDENTIALS: 200001,
  AUTH_REQUIRED: 200002,
  ACCESS_EXPIRED: 200003,
  SESSION_REVOKED: 200004,
  USER_DISABLED: 200005,
  PERMISSION_DENIED: 200006,
  USERNAME_EXISTS: 200007,
  REGISTRATION_DISABLED: 200008,
  INVALID_TOKEN: 200009,
  REFRESH_REUSED: 200010,

  VPS_NOT_FOUND: 300001,
  MONITOR_DISABLED: 300002,
  MONITOR_BUSY: 300003,
  CONFIG_VERSION_CONFLICT: 300004,
  COLLECTOR_UNAVAILABLE: 300005,
  SOURCE_URL_REJECTED: 300006,

  COMMENTS_DISABLED: 400001,
  ANONYMOUS_DISABLED: 400002,
  COMMENT_PARENT_NOT_FOUND: 400003,
  COMMENT_DEPTH_EXCEEDED: 400004,
  COMMENT_NOT_OWNED: 400005,
  COMMENT_STATE_CONFLICT: 400006,
  COMMENT_PARENT_UNAVAILABLE: 400007,

  LAST_ADMIN_REQUIRED: 500001,
  CODE_ALREADY_EXISTS: 500002,

  INTERNAL_ERROR: 900001,
  DATABASE_UNAVAILABLE: 900002,
  SEARCH_UNAVAILABLE: 900003,
} as const;

export type BusinessCodeKey = keyof typeof BusinessCode;
export type BusinessCodeValue = typeof BusinessCode[BusinessCodeKey];

export const BusinessCodeMessages: Record<number, string> = {
  0: '操作成功',
  100001: '请求参数不合法',
  100002: '请求格式不正确',
  100003: '操作过于频繁，请稍后再试',
  100004: '请求验证失败，请刷新页面',
  100005: '资源不存在',
  100006: '请求内容过大',
  100007: '不支持的请求格式',

  200001: '用户名或密码错误，或账户不可用',
  200002: '请先登录',
  200003: '登录凭证已过期',
  200004: '登录会话已失效，请重新登录',
  200005: '账户已停用',
  200006: '没有操作权限',
  200007: '用户名已被使用',
  200008: '暂未开放注册',
  200009: '登录凭证无效',
  200010: '登录会话已失效，请重新登录',

  300001: 'VPS 不存在或已下架',
  300002: '请先启用商家、VPS 和监控',
  300003: '当前正在检查，请稍后查看',
  300004: '配置已更新，请刷新后重试',
  300005: '当前采集器不可用',
  300006: '监控地址不符合访问要求',

  400001: '暂未开放评论',
  400002: '暂未开放匿名评论',
  400003: '回复的评论不存在',
  400004: '已达到评论嵌套层数上限',
  400005: '只能删除自己的评论',
  400006: '当前评论状态不支持此操作',
  400007: '该评论暂不支持回复',

  500001: '必须保留至少一个启用的管理员',
  500002: '商家或 VPS 标识已存在',

  900001: '服务暂时异常，请稍后重试',
  900002: '服务暂不可用，请稍后重试',
  900003: '搜索暂不可用，请稍后重试',
};
