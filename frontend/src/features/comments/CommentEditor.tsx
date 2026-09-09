import React, { useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { useSettings } from '@/app/SettingsContext';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { useToast } from '@/components/ui/Toast';
import { apiClient } from '@/lib/http/client';
import { CommentPrivate } from '@/types/api';
import { BusinessCode } from '@/types/error';
import { isAppError } from '@/lib/http/errors';
import { Link } from 'react-router-dom';
import { Send, Lock } from 'lucide-react';

export interface CommentEditorProps {
  vpsId: string;
  parentId?: string | null;
  replyToNickname?: string;
  onSuccess: (newComment: CommentPrivate) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}

export const CommentEditor: React.FC<CommentEditorProps> = ({
  vpsId,
  parentId = null,
  replyToNickname,
  onSuccess,
  onCancel,
  autoFocus = false,
}) => {
  const { user } = useAuth();
  const { settings } = useSettings();
  const { toast } = useToast();

  const [content, setContent] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  // 1. 评论总开关检查
  if (settings && !settings.comments_enabled) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-500 text-center">
        本站当前已暂停新增评论，已有评论仍可正常浏览。
      </div>
    );
  }

  // 2. 未登录提示
  if (!user) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
        <div className="flex items-center space-x-2 text-gray-600">
          <Lock className="w-4 h-4 text-gray-400 shrink-0" />
          <span>登录后即可发表评论或匿名回复。</span>
        </div>
        <Link to={`/login?returnTo=${encodeURIComponent(window.location.pathname)}`}>
          <Button variant="primary" size="sm">
            立即登录
          </Button>
        </Link>
      </div>
    );
  }

  const maxLength = 2000;
  const currentLength = content.trim().length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentLength < 1) {
      toast('error', '请输入评论内容');
      return;
    }
    if (currentLength > maxLength) {
      toast('error', `评论内容不能超过 ${maxLength} 字符`);
      return;
    }

    try {
      setSubmitting(true);
      setWarningMessage(null);
      const res = await apiClient.post<CommentPrivate>(`/vps/${vpsId}/comments`, {
        content: content.trim(),
        is_anonymous: isAnonymous,
        parent_id: parentId,
      });

      setContent('');
      setIsAnonymous(false);

      if (res.data.visibility === 2) {
        toast('info', '评论已提交，将进入审核队列，审核通过后公开');
      } else {
        toast('success', '评论发布成功');
      }

      onSuccess(res.data);
    } catch (err: unknown) {
      if (isAppError(err)) {
        if (err.code === BusinessCode.ANONYMOUS_DISABLED) {
          // 400002: 暂未开放匿名评论，保留草稿并友好提示取消勾选
          setWarningMessage('当前站点暂未开放匿名评论，请取消勾选“匿名发表”后重新提交。');
          return;
        }
        toast('error', err.message);
      } else {
        toast('error', '评论提交失败，请稍后重试');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
      {replyToNickname && (
        <div className="text-xs text-gray-500 font-medium">
          回复 <span className="text-brand-600 font-semibold">@{replyToNickname}</span>：
        </div>
      )}

      {warningMessage && (
        <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
          {warningMessage}
        </div>
      )}

      <div className="relative">
        <textarea
          rows={parentId ? 2 : 3}
          value={content}
          autoFocus={autoFocus}
          onChange={(e) => setContent(e.target.value)}
          placeholder={replyToNickname ? `写下对 @${replyToNickname} 的回复...` : '发表对此套餐的看法或疑问...'}
          className="w-full rounded-lg border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors resize-y min-h-[70px]"
          disabled={submitting}
        />
        <div className="absolute bottom-2.5 right-3 text-[11px] text-gray-400 select-none">
          {currentLength} / {maxLength}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {settings?.anonymous_comments_enabled ? (
          <Checkbox
            label="匿名发表"
            description="对公众仅显示“匿名用户”，真实账号仅管理员后台可查"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
            disabled={submitting}
          />
        ) : (
          <span className="text-xs text-gray-400">匿名评论未开放</span>
        )}

        <div className="flex items-center space-x-2 ml-auto">
          {onCancel && (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
              取消
            </Button>
          )}
          <Button type="submit" variant="primary" size="sm" loading={submitting} disabled={currentLength === 0}>
            <Send className="w-3.5 h-3.5 mr-1.5" />
            {parentId ? '回复' : '发表评论'}
          </Button>
        </div>
      </div>
    </form>
  );
};
