import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import * as passwordResetApi from '@/api/passwordReset';
import { normalizeMail } from '@/lib/format/mail';
import { isAppError, getErrorMessage } from '@/lib/http/errors';
import { BusinessCode } from '@/types/error';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CheckCircle2, AlertTriangle, Send, ArrowLeft, Hammer } from 'lucide-react';

export interface PasswordResetFormProps {
  onSuccess?: () => void;
}

export const PasswordResetForm: React.FC<PasswordResetFormProps> = ({ onSuccess }) => {
  const [mail, setMail] = useState('');
  const [resetId, setResetId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [sendingCode, setSendingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isNotImplemented, setIsNotImplemented] = useState(false);

  const [retryCountdown, setRetryCountdown] = useState(0);
  const [expiresCountdown, setExpiresCountdown] = useState(0);

  const retryTimerRef = useRef<number | null>(null);
  const expiryTimerRef = useRef<number | null>(null);

  const clearTimers = () => {
    if (retryTimerRef.current) {
      window.clearInterval(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (expiryTimerRef.current) {
      window.clearInterval(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearTimers();
  }, []);

  const handleSendCode = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setIsNotImplemented(false);

    const { valid, normalized, error } = normalizeMail(mail);
    if (!valid) {
      setErrorMsg(error || '请输入合法的邮箱地址');
      return;
    }

    try {
      setSendingCode(true);
      const res = await passwordResetApi.requestPasswordResetCode({
        mail: normalized,
      });

      const { reset_id, retry_after, expires_in, message } = res.data;
      setResetId(reset_id);
      setInfoMsg(message || '如果该邮箱已绑定可用账号，将收到密码重置验证码。');

      clearTimers();
      const initialRetry = retry_after > 0 ? retry_after : 60;
      setRetryCountdown(initialRetry);
      retryTimerRef.current = window.setInterval(() => {
        setRetryCountdown((prev) => {
          if (prev <= 1) {
            if (retryTimerRef.current) window.clearInterval(retryTimerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      const initialExpires = expires_in > 0 ? expires_in : 600;
      setExpiresCountdown(initialExpires);
      expiryTimerRef.current = window.setInterval(() => {
        setExpiresCountdown((prev) => {
          if (prev <= 1) {
            if (expiryTimerRef.current) window.clearInterval(expiryTimerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err: unknown) {
      if (isAppError(err) && (err.code === BusinessCode.NOT_IMPLEMENTED || err.status === 501)) {
        setIsNotImplemented(true);
        setErrorMsg('密码找回接口尚未实现 (HTTP 501 / NOT_IMPLEMENTED)');
      } else if (isAppError(err)) {
        if (err.code === BusinessCode.RATE_LIMITED) {
          setErrorMsg('操作过于频繁，请稍后再试');
        } else if (err.code === BusinessCode.MAIL_UNAVAILABLE) {
          setErrorMsg('邮件服务暂不可用或发送失败，请联系管理员');
        } else {
          setErrorMsg(getErrorMessage(err));
        }
      } else {
        setErrorMsg('网络异常，发送验证码失败');
      }
    } finally {
      setSendingCode(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsNotImplemented(false);

    if (!resetId) {
      setErrorMsg('请先申请重置验证码');
      return;
    }

    if (!code || code.trim().length !== 6) {
      setErrorMsg('请输入正确的 6 位数字验证码');
      return;
    }

    if (!newPassword) {
      setErrorMsg('请输入新密码');
      return;
    }

    const bytes = new TextEncoder().encode(newPassword).length;
    if (bytes < 8 || bytes > 72) {
      setErrorMsg('新密码的 UTF-8 长度须在 8 到 72 字节之间');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('两次输入的密码不一致');
      return;
    }

    try {
      setSubmitting(true);
      await passwordResetApi.confirmPasswordReset({
        reset_id: resetId,
        code: code.trim(),
        new_password: newPassword,
      });

      clearTimers();
      setIsCompleted(true);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: unknown) {
      if (isAppError(err) && (err.code === BusinessCode.NOT_IMPLEMENTED || err.status === 501)) {
        setIsNotImplemented(true);
        setErrorMsg('密码重置提交接口尚未实现 (HTTP 501 / NOT_IMPLEMENTED)');
      } else if (isAppError(err)) {
        if (err.code === BusinessCode.PASSWORD_RESET_INVALID) {
          setErrorMsg('重置请求或验证码错误、过期或已失效，请重新申请');
        } else if (err.code === BusinessCode.RATE_LIMITED) {
          setErrorMsg('尝试次数过多，请求已被限制，请稍后再试');
        } else {
          setErrorMsg(getErrorMessage(err));
        }
      } else {
        setErrorMsg('网络异常，提交重置密码失败');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (isCompleted) {
    return (
      <div className="w-full max-w-md mx-auto p-6 sm:p-8 bg-white rounded-2xl border border-gray-200 shadow-sm text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">密码已成功重置</h2>
        <p className="text-sm text-gray-600 leading-relaxed">
          您的密码已更新，所有现有登录凭证已失效。请使用新密码重新登录系统。
        </p>
        <div className="pt-2">
          <Link to="/login">
            <Button variant="primary" size="md" className="w-full">
              前往登录页面
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">找回登录密码</h1>
        <p className="text-sm text-gray-500">通过绑定的邮箱接收 6 位验证码重置密码</p>
      </div>

      {isNotImplemented && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-amber-800 text-sm flex items-start space-x-3">
          <Hammer className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">功能尚未实现 (HTTP 501)</p>
            <p className="mt-1 text-xs text-amber-700">
              后端密码找回端点返回 501，骨架阶段不提供假重置。
            </p>
          </div>
        </div>
      )}

      {errorMsg && !isNotImplemented && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-red-700 text-sm flex items-start space-x-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {infoMsg && (
        <div className="rounded-xl bg-blue-50 border border-blue-200 p-3.5 text-blue-700 text-sm flex items-start space-x-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-blue-500 mt-0.5" />
          <span>{infoMsg}</span>
        </div>
      )}

      <div className="bg-white p-6 sm:p-8 rounded-2xl border border-gray-200 shadow-sm space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">绑定的邮箱地址</label>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="请输入安全邮箱"
              value={mail}
              onChange={(e) => setMail(e.target.value)}
              disabled={sendingCode || submitting || retryCountdown > 0}
            />
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={handleSendCode}
              loading={sendingCode}
              disabled={retryCountdown > 0 || !mail.trim()}
              className="shrink-0"
            >
              {retryCountdown > 0 ? (
                <span className="text-xs">{retryCountdown}s</span>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 mr-1" />
                  <span className="text-xs">发送验证码</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {resetId && (
          <form onSubmit={handleConfirmReset} className="space-y-4 pt-2 border-t border-gray-100">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-gray-700">6 位邮箱验证码</label>
                {expiresCountdown > 0 && (
                  <span className="text-xs text-amber-600">
                    有效时间剩余: {Math.floor(expiresCountdown / 60)}分{expiresCountdown % 60}秒
                  </span>
                )}
              </div>
              <Input
                type="text"
                placeholder="6位数字验证码"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                disabled={submitting}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">新密码</label>
              <Input
                type="password"
                placeholder="至少 8 位新密码"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={submitting}
                autoComplete="new-password"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">确认新密码</label>
              <Input
                type="password"
                placeholder="再次输入新密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={submitting}
                autoComplete="new-password"
                required
              />
            </div>

            <Button type="submit" variant="primary" size="md" className="w-full mt-2" loading={submitting}>
              确认重置密码
            </Button>
          </form>
        )}

        <div className="text-center pt-1 border-t border-gray-100">
          <Link
            to="/login"
            className="inline-flex items-center text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            返回登录
          </Link>
        </div>
      </div>
    </div>
  );
};
