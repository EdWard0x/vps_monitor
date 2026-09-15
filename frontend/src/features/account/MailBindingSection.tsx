import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/app/AuthContext';
import { useToast } from '@/components/ui/Toast';
import * as mailApi from '@/api/mail';
import { formatDate } from '@/lib/format/date';
import { normalizeMail } from '@/lib/format/mail';
import { isAppError, getErrorMessage } from '@/lib/http/errors';
import { BusinessCode } from '@/types/error';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { Mail, AlertTriangle, Send } from 'lucide-react';

export const MailBindingSection: React.FC = () => {
  const { user, updateUser } = useAuth();
  const { toast } = useToast();

  const isBound = Boolean(user?.mail && user?.mail_verified);
  const isMailRequired = Boolean(user?.mail_required);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [targetMail, setTargetMail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationId, setVerificationId] = useState<string | null>(null);

  // 倒计时状态
  const [retryCountdown, setRetryCountdown] = useState(0);
  const [expiresCountdown, setExpiresCountdown] = useState(0);

  // 加载与错误状态
  const [sendingCode, setSendingCode] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  const openDialog = () => {
    setTargetMail('');
    setCurrentPassword('');
    setVerificationCode('');
    setVerificationId(null);
    setFormError(null);
    clearTimers();
    setRetryCountdown(0);
    setExpiresCountdown(0);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (sendingCode || verifying) return;
    setDialogOpen(false);
    clearTimers();
  };

  // 发送或重新发送验证码
  const handleSendCode = async () => {
    setFormError(null);
    const { valid, normalized, error } = normalizeMail(targetMail);
    if (!valid) {
      setFormError(error || '请输入合法的邮箱地址');
      return;
    }

    if (isBound && normalized === user?.mail?.toLowerCase()) {
      setFormError('新邮箱地址不能与当前已绑定的邮箱相同');
      return;
    }

    if (isBound && !currentPassword) {
      setFormError('换绑邮箱需要输入当前登录密码以验证身份');
      return;
    }

    try {
      setSendingCode(true);
      const res = await mailApi.sendMailCode({
        mail: normalized,
        ...(isBound ? { current_password: currentPassword } : {}),
      });

      const { verification_id, retry_after, expires_in } = res.data;
      setVerificationId(verification_id);

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

      const initialExpires = expires_in > 0 ? expires_in : 900;
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

      toast({
        type: 'info',
        title: '验证码已发送',
        message: `已向 ${normalized} 发送验证码，请在有效时间内填写。`,
      });
    } catch (err: unknown) {
      if (isAppError(err)) {
        if (err.code === BusinessCode.NOT_IMPLEMENTED || err.status === 501) {
          setFormError('后端邮件发送接口尚未实现 (HTTP 501)');
        } else if (err.code === BusinessCode.RATE_LIMITED) {
          setFormError('操作过于频繁，请稍后再试');
        } else if (err.code === BusinessCode.MAIL_EXISTS) {
          setFormError('该邮箱已被其他账号使用，无法绑定');
        } else if (err.code === BusinessCode.MAIL_UNCHANGED) {
          setFormError('新邮箱与当前邮箱相同，无需重复绑定');
        } else if (err.code === BusinessCode.MAIL_UNAVAILABLE) {
          setFormError('邮件发送服务暂不可用或投递失败，请稍后重试');
        } else if (err.code === BusinessCode.INVALID_CREDENTIALS) {
          setFormError('当前登录密码错误，无法验证换绑');
        } else {
          setFormError(getErrorMessage(err));
        }
      } else {
        setFormError('网络异常，发送验证码失败');
      }
    } finally {
      setSendingCode(false);
    }
  };

  // 校验验证码并完成绑定/换绑
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!verificationId) {
      setFormError('请先获取邮箱验证码');
      return;
    }

    if (!verificationCode || verificationCode.trim().length !== 6) {
      setFormError('请输入 6 位数字验证码');
      return;
    }

    try {
      setVerifying(true);
      const res = await mailApi.confirmMail({
        verification_id: verificationId,
        code: verificationCode.trim(),
      });

      updateUser(res.data);
      closeDialog();

      toast({
        type: 'success',
        title: isBound ? '邮箱换绑成功' : '邮箱绑定成功',
        message: `安全邮箱已生效：${res.data.mail}`,
      });
    } catch (err: unknown) {
      if (isAppError(err)) {
        if (err.code === BusinessCode.NOT_IMPLEMENTED || err.status === 501) {
          setFormError('后端邮箱验证接口尚未实现 (HTTP 501)');
        } else if (err.code === BusinessCode.MAIL_CODE_INVALID) {
          setFormError('验证码错误、已过期或已失效，请重新核对或发送');
        } else if (err.code === BusinessCode.MAIL_EXISTS) {
          setFormError('该邮箱已被其他账号绑定，本次验证已作废');
        } else if (err.code === BusinessCode.RATE_LIMITED) {
          setFormError('尝试次数过多，请求已被限制，请稍后重试');
        } else {
          setFormError(getErrorMessage(err));
        }
      } else {
        setFormError('网络异常，验证邮箱失败');
      }
    } finally {
      setVerifying(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-lg font-bold text-gray-900">安全邮箱</h2>
            {isBound ? (
              <Badge variant="green">已验证</Badge>
            ) : isMailRequired ? (
              <Badge variant="red">必须绑定</Badge>
            ) : (
              <Badge variant="gray">未绑定</Badge>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            绑定邮箱用于管理员后台权限安全校验及找回登录密码。
          </p>
        </div>

        <Button variant={isBound ? 'outline' : 'primary'} size="sm" onClick={openDialog}>
          {isBound ? '更换邮箱' : '立即绑定'}
        </Button>
      </div>

      {isMailRequired && !isBound && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-amber-800 text-xs sm:text-sm flex items-start space-x-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>
            当前账号拥有管理员角色，按照系统安全策略，必须完成邮箱验证后方可使用后台管理功能。
          </span>
        </div>
      )}

      {isBound ? (
        <div className="pt-2 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500 block text-xs">当前邮箱</span>
            <span className="font-semibold text-gray-900 flex items-center mt-0.5">
              <Mail className="w-3.5 h-3.5 mr-1.5 text-gray-400" />
              {user?.mail}
            </span>
          </div>
          <div>
            <span className="text-gray-500 block text-xs">验证时间</span>
            <span className="font-medium text-gray-700 mt-0.5 block">
              {formatDate(user?.mail_verified_at)}
            </span>
          </div>
        </div>
      ) : (
        <div className="pt-2 border-t border-gray-100 text-xs text-gray-400">
          尚未绑定任何安全邮箱，建议尽快绑定以保障账号安全。
        </div>
      )}

      {/* 绑定/换绑对话框 */}
      <Dialog
        isOpen={dialogOpen}
        onClose={closeDialog}
        title={isBound ? '更换安全邮箱' : '绑定安全邮箱'}
        description={
          isBound
            ? '更换安全邮箱需要验证当前密码，并向新邮箱发送验证码'
            : '绑定邮箱后可用于账号重置密码及管理员后台权限认证'
        }
      >
        <form onSubmit={handleVerify} className="space-y-4 pt-2">
          {formError && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-red-700 text-xs sm:text-sm flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {isBound && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                当前登录密码
              </label>
              <Input
                type="password"
                placeholder="请输入当前密码以验证身份"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={sendingCode || verifying}
                required
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              {isBound ? '新邮箱地址' : '邮箱地址'}
            </label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="请输入有效邮箱"
                value={targetMail}
                onChange={(e) => setTargetMail(e.target.value)}
                disabled={sendingCode || verifying || retryCountdown > 0}
                required
              />
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={handleSendCode}
                loading={sendingCode}
                disabled={retryCountdown > 0 || !targetMail.trim()}
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

          {verificationId && (
            <div className="pt-2 border-t border-gray-100 space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    6 位数字验证码
                  </label>
                  {expiresCountdown > 0 && (
                    <span className="text-xs text-amber-600">
                      有效时间: {Math.floor(expiresCountdown / 60)}分{expiresCountdown % 60}秒
                    </span>
                  )}
                </div>
                <Input
                  type="text"
                  placeholder="请输入收到的 6 位数字验证码"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                  disabled={verifying}
                  required
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <Button type="button" variant="ghost" size="sm" onClick={closeDialog} disabled={verifying}>
                  取消
                </Button>
                <Button type="submit" variant="primary" size="sm" loading={verifying}>
                  验证并绑定
                </Button>
              </div>
            </div>
          )}
        </form>
      </Dialog>
    </section>
  );
};
