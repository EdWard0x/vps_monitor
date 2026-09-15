// 邮箱校验与规整工具（对齐后端 NormalizeMail 契约）
// ASCII addr-spec、整体转小写、保留点号和 +tag，拒绝显示名和地址列表。

export function normalizeMail(raw: string): { valid: boolean; normalized: string; error?: string } {
  const v = raw.trim().toLowerCase();

  if (!v) {
    return { valid: false, normalized: '', error: '请输入邮箱地址' };
  }

  if (v.length > 254) {
    return { valid: false, normalized: '', error: '邮箱总长度不能超过 254 个字符' };
  }

  if (v.includes('\r') || v.includes('\n')) {
    return { valid: false, normalized: '', error: '邮箱地址不能包含换行符' };
  }

  // 必须全部为可见 ASCII 字符 (33~126)
  for (let i = 0; i < v.length; i++) {
    const code = v.charCodeAt(i);
    if (code < 33 || code > 126) {
      return { valid: false, normalized: '', error: '邮箱仅支持 ASCII 可见字符，不能包含空格或非英文字符' };
    }
  }

  const atIndex = v.lastIndexOf('@');
  if (atIndex < 1) {
    return { valid: false, normalized: '', error: '邮箱格式不正确，缺少 @ 或用户名为空' };
  }

  // local-part 长度 1~64
  const localPart = v.slice(0, atIndex);
  if (localPart.length < 1 || localPart.length > 64) {
    return { valid: false, normalized: '', error: '邮箱用户名部分长度须在 1~64 个字符之间' };
  }

  const domain = v.slice(atIndex + 1);
  if (!domain || !domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) {
    return { valid: false, normalized: '', error: '邮箱域名格式不正确，须包含有效顶级域' };
  }

  // 拒绝显示名，如 "Alice <alice@example.com>"
  if (v.includes('<') || v.includes('>') || v.includes('"') || v.includes(',')) {
    return { valid: false, normalized: '', error: '邮箱不能包含显示名或姓名标签' };
  }

  // 基础邮箱正则校验
  const emailRegex = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
  if (!emailRegex.test(v)) {
    return { valid: false, normalized: '', error: '邮箱地址格式不合法' };
  }

  return { valid: true, normalized: v };
}
