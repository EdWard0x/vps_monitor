import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, BellRing } from 'lucide-react';
import { useAuth } from '@/app/AuthContext';
import * as noticeApi from '@/api/notice';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { getErrorMessage, isAppError } from '@/lib/http/errors';
import { BusinessCode } from '@/types/error';
import { NoticeSettings } from '@/types/notice';
import { beginServerChanBinding } from '@/lib/serverchanBinding';
import { changeAndConfirmNotice, isMissingServerKey, saveAndConfirmKey } from '@/lib/noticeActions';

function noticeError(error: unknown): string {
  if (isAppError(error) && (error.status === 404 || error.status === 501 || error.code === BusinessCode.NOT_IMPLEMENTED)) {
    return '通知设置接口尚未就绪，请稍后重试。';
  }
  return getErrorMessage(error);
}

export const NotificationSettingsPage: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<NoticeSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'save' | 'enable' | 'disable' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [keyInput, setKeyInput] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await noticeApi.getNotice();
      setSettings(result.data);
    } catch (err) {
      setSettings(null);
      setError(noticeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if ((location.state as { bindingSaved?: boolean } | null)?.bindingSaved && settings?.key_bound) {
      setSuccess('绑定成功，可开启微信通知。Key 已保存，尚未验证微信送达。');
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, settings?.key_bound, navigate]);

  const startBinding = () => {
    if (!user) return;
    try {
      beginServerChanBinding(user.id);
    } catch {
      setError('无法启动 Server 酱绑定，请检查浏览器会话存储后重试，或手动填写 Key。');
    }
  };

  const saveKey = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const key = keyInput.trim();
    if (!key || key === '{key}' || key.length > 64 || /\s/.test(key)) {
      setError('请输入 1–64 位的实际 Key，不能包含空白字符。');
      return;
    }
    setBusy('save');
    setError(null);
    setSuccess(null);
    try {
      const current = await saveAndConfirmKey(key);
      setSettings(current);
      setKeyInput('');
      setShowForm(false);
      setNeedsKey(false);
      setSuccess('Key 已保存，可开启微信通知。尚未验证微信送达。');
    } catch (err) {
      setSettings(null);
      // The server could echo submitted input in an error. Do not render it.
      setError(isAppError(err) && (err.status === 404 || err.status === 501) ? '通知设置接口尚未就绪，请稍后重试。' : '保存或确认 Key 失败，请重试。');
    } finally {
      setBusy(null);
    }
  };

  const changeEnabled = async () => {
    if (busy || !settings) return;
    if (!settings.notice_enabled && (!settings.key_bound || needsKey)) {
      setNeedsKey(true);
      setError('请先绑定 Server 酱 Key，再开启微信通知。');
      return;
    }
    const enabling = !settings.notice_enabled;
    setBusy(enabling ? 'enable' : 'disable');
    setError(null);
    setSuccess(null);
    try {
      const current = await changeAndConfirmNotice(enabling);
      setSettings(current);
      setNeedsKey(false);
      setSuccess(enabling ? '全部收藏的微信通知已开启。' : '全部收藏的微信通知已关闭。');
    } catch (err) {
      const unbound = enabling && isMissingServerKey(err);
      if (unbound) setNeedsKey(true);
      setError(unbound ? '请先绑定 Server 酱 Key，再开启微信通知。' : err instanceof Error && err.message === '开关状态未确认' ? '操作已提交，但查询到的开关状态未更新，请重试查询。' : noticeError(err));
      try {
        setSettings((await noticeApi.getNotice()).data);
      } catch {
        setSettings(null);
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link to="/account" className="inline-flex items-center text-xs text-gray-500 hover:text-gray-900 mb-3"><ArrowLeft className="w-3.5 h-3.5 mr-1" />返回个人中心</Link>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl flex items-center"><BellRing className="w-7 h-7 text-brand-600 mr-3" />微信通知</h1>
        <p className="text-sm text-gray-500 mt-1">收藏的 VPS 有货时，通过 Server 酱发送到你的微信。</p>
      </div>

      {loading ? <LoadingSpinner label="正在读取微信通知设置..." /> : !settings ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs"><ErrorState title="读取通知设置失败" description={error || '请稍后重试。'} onRetry={refresh} /></div>
      ) : (
        <>
          {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error} <button className="underline ml-2" onClick={refresh}>重新查询</button></div>}
          {success && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div>}
          <section className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-3"><h2 className="text-base font-bold text-gray-900">Server 酱绑定</h2><Badge variant={settings.key_bound ? 'green' : 'yellow'}>{settings.key_bound ? '已绑定' : '未绑定'}</Badge></div>
            <p className="text-sm text-gray-500">Key 只用于你的微信通知。保存 Key 不会自动开启通知，也不会验证实际送达。</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={startBinding} disabled={Boolean(busy)}>{settings.key_bound ? '前往 Server 酱更换 Key' : '前往 Server 酱绑定'}</Button>
              <Button variant="outline" disabled={Boolean(busy)} onClick={() => setShowForm((value) => !value)}>{settings.key_bound ? '手动更换 Key' : '手动填写 Key'}</Button>
            </div>
            {showForm && <form onSubmit={saveKey} className="max-w-md space-y-3">
              <Input label="Server 酱 Key" type={showKey ? 'text' : 'password'} autoComplete="off" value={keyInput} onChange={(event) => setKeyInput(event.target.value)} disabled={Boolean(busy)} maxLength={64} placeholder="填写实际 Key" />
              <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={showKey} onChange={(event) => setShowKey(event.target.checked)} />显示 Key</label>
              <Button type="submit" loading={busy === 'save'} disabled={Boolean(busy)}>保存 Key</Button>
            </form>}
          </section>

          <section className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-3"><h2 className="text-base font-bold text-gray-900">全部收藏的库存通知</h2><Badge variant={settings.notice_enabled ? 'green' : 'gray'}>{settings.notice_enabled ? '已开启' : '已关闭'}</Badge></div>
            <Button variant={settings.notice_enabled ? 'outline' : 'primary'} onClick={changeEnabled} loading={busy === 'enable' || busy === 'disable'} disabled={Boolean(busy)}>{settings.notice_enabled ? '关闭微信通知' : '开启微信通知'}</Button>
            <p className="text-sm text-gray-500 leading-6">每个 VPS 每轮最多成功通知三次，两次通知需间隔一段时间。距最后一次成功通知达到重置间隔后，下次通知重新计数；具体间隔由站点配置。关闭再开启不会立即重置发送次数。关闭前已进入发送流程的通知可能仍会送达。</p>
          </section>
        </>
      )}
    </div>
  );
};
