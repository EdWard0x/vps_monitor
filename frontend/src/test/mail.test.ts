import { describe, it, expect } from 'vitest';
import { normalizeMail } from '../lib/format/mail';
import { BusinessCode, BusinessCodeMessages } from '../types/error';

describe('Mail Verification and Normalization tests', () => {
  it('normalizes ASCII email with lowercasing and trimming', () => {
    const res = normalizeMail('   User@Example.COM   ');
    expect(res.valid).toBe(true);
    expect(res.normalized).toBe('user@example.com');
  });

  it('preserves plus tags and dots according to specification', () => {
    const res = normalizeMail('John.Doe+monitor123@sub.domain.org');
    expect(res.valid).toBe(true);
    expect(res.normalized).toBe('john.doe+monitor123@sub.domain.org');
  });

  it('rejects display names and address lists', () => {
    expect(normalizeMail('Alice <alice@example.com>').valid).toBe(false);
    expect(normalizeMail('user1@example.com, user2@example.com').valid).toBe(false);
    expect(normalizeMail('"Quoted Name"@example.com').valid).toBe(false);
  });

  it('rejects non-ASCII and whitespace inside addresses', () => {
    expect(normalizeMail('user name@example.com').valid).toBe(false);
    expect(normalizeMail('测试@example.com').valid).toBe(false);
    expect(normalizeMail('user@域名.cn').valid).toBe(false);
    expect(normalizeMail('user\r\n@example.com').valid).toBe(false);
  });

  it('rejects invalid email formats or length limits', () => {
    expect(normalizeMail('').valid).toBe(false);
    expect(normalizeMail('plainaddress').valid).toBe(false);
    expect(normalizeMail('@example.com').valid).toBe(false);
    expect(normalizeMail('user@').valid).toBe(false);
    expect(normalizeMail('user@example').valid).toBe(false);
    expect(normalizeMail('user@.com').valid).toBe(false);
    expect(normalizeMail('user@example.').valid).toBe(false);

    const longMail = 'a'.repeat(250) + '@test.com';
    expect(normalizeMail(longMail).valid).toBe(false);
  });

  it('BusinessCode registry contains all mail verification error codes', () => {
    expect(BusinessCode.MAIL_REQUIRED).toBe(200011);
    expect(BusinessCode.MAIL_EXISTS).toBe(200012);
    expect(BusinessCode.MAIL_CODE_INVALID).toBe(200013);
    expect(BusinessCode.MAIL_UNAVAILABLE).toBe(200014);
    expect(BusinessCode.MAIL_UNCHANGED).toBe(200015);

    expect(BusinessCodeMessages[200011]).toContain('管理员必须先绑定并验证邮箱');
    expect(BusinessCodeMessages[200012]).toContain('该邮箱不可用于绑定');
    expect(BusinessCodeMessages[200013]).toContain('验证码错误、过期或已失效');
    expect(BusinessCodeMessages[200014]).toContain('邮件服务暂不可用或发送失败');
    expect(BusinessCodeMessages[200015]).toContain('已绑定相同邮箱');
  });

  it('validates 6-digit verification code string format including leading zeros', () => {
    const isValidCode = (code: string) => /^\d{6}$/.test(code);

    expect(isValidCode('012345')).toBe(true);
    expect(isValidCode('000000')).toBe(true);
    expect(isValidCode('987654')).toBe(true);
    expect(isValidCode('12345')).toBe(false);
    expect(isValidCode('1234567')).toBe(false);
    expect(isValidCode('12a456')).toBe(false);
  });
});
