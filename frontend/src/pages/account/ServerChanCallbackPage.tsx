import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  clearCapturedCallback,
  hasCapturedCallback,
  saveCapturedCallback,
  validateCapturedCallback,
} from '@/lib/serverchanBinding';

export const ServerChanCallbackPage: React.FC = () => {
  const { status, user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (status === 'loading') return;
    let active = true;
    if (status !== 'authenticated' || !user) {
      clearCapturedCallback(sessionStorage);
      setBusy(false);
      setError('登录状态已失效，请登录后重新发起绑定。');
      return () => { active = false; };
    }
    if (!validateCapturedCallback(user.id, sessionStorage)) {
      clearCapturedCallback(sessionStorage);
      setBusy(false);
      setError('绑定回跳无效、已过期或登录账号已变化，请重新发起绑定。');
      return () => { active = false; };
    }
    setBusy(true);
    saveCapturedCallback().then(() => {
      if (active) navigate('/account/notifications', { replace: true, state: { bindingSaved: true } });
    }).catch(() => {
      if (active) {
        setBusy(false);
        setError('保存 Key 失败，请重试或手动填写 Key。');
      }
    });
    return () => { active = false; };
  }, [status, user?.id, navigate]);

  const retry = () => {
    if (!user || !validateCapturedCallback(user.id, sessionStorage) || !hasCapturedCallback()) {
      clearCapturedCallback(sessionStorage);
      setError('回跳已失效，请重新发起绑定。');
      return;
    }
    setBusy(true);
    setError(null);
    saveCapturedCallback().then(() => {
      navigate('/account/notifications', { replace: true, state: { bindingSaved: true } });
    }).catch(() => {
      setBusy(false);
      setError('保存 Key 失败，请重试或手动填写 Key。');
    });
  };

  if (status === 'loading' || busy) return <LoadingSpinner label="正在确认绑定状态..." />;

  return (
    <div className="max-w-xl mx-auto rounded-2xl border border-gray-200 bg-white p-6 space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Server 酱绑定</h1>
      <p role="alert" className="text-sm text-red-600">{error}</p>
      <div className="flex flex-wrap gap-2">
        {status === 'authenticated' && user && hasCapturedCallback() && (
          <Button onClick={retry}>重试保存</Button>
        )}
        <Link to="/account/notifications" onClick={() => clearCapturedCallback(sessionStorage)}>
          <Button variant="outline">前往通知设置或手动填写 Key</Button>
        </Link>
        {status !== 'authenticated' && <Link to="/login?returnTo=%2Faccount%2Fnotifications"><Button variant="outline">前往登录</Button></Link>}
      </div>
    </div>
  );
};
