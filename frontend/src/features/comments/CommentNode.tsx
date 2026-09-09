import React, { useState } from 'react';
import { CommentPublic, CommentPrivate } from '@/types/api';
import { formatRelativeTime } from '@/lib/format/date';
import { CommentEditor } from './CommentEditor';
import { apiClient } from '@/lib/http/client';
import { Button } from '@/components/ui/Button';
import { MessageSquare, ChevronDown, ChevronUp, User, EyeOff, CornerDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CommentNodeProps {
  comment: CommentPublic;
  vpsId: string;
  onRefreshParentTree?: () => void;
  highlightId?: string | null;
}

export const CommentNode: React.FC<CommentNodeProps> = ({
  comment,
  vpsId,
  onRefreshParentTree,
  highlightId,
}) => {
  const [repliesExpanded, setRepliesExpanded] = useState(false);
  const [replies, setReplies] = useState<CommentPublic[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [showReplyEditor, setShowReplyEditor] = useState(false);

  const isHighlighted = highlightId === comment.id;

  // 加载子评论
  const loadReplies = async (cursor?: string | null) => {
    try {
      setLoadingReplies(true);
      const url = cursor
        ? `/vps/${vpsId}/comments?parent_id=${comment.id}&cursor=${encodeURIComponent(cursor)}`
        : `/vps/${vpsId}/comments?parent_id=${comment.id}`;

      const res = await apiClient.get<{ items: CommentPublic[]; next_cursor: string | null; has_more: boolean }>(url);
      if (cursor) {
        setReplies((prev) => [...prev, ...res.data.items]);
      } else {
        setReplies(res.data.items);
      }
      setNextCursor(res.data.next_cursor);
      setHasMore(res.data.has_more);
    } catch {
      // 忽略
    } finally {
      setLoadingReplies(false);
    }
  };

  const toggleReplies = () => {
    if (!repliesExpanded) {
      setRepliesExpanded(true);
      if (replies.length === 0) {
        loadReplies();
      }
    } else {
      setRepliesExpanded(false);
    }
  };

  const handleReplySuccess = (_newComment: CommentPrivate) => {
    setShowReplyEditor(false);
    // 如果子列表已展开，重新拉取最新子评论
    if (repliesExpanded) {
      loadReplies();
    } else {
      setRepliesExpanded(true);
      loadReplies();
    }
    if (onRefreshParentTree) {
      onRefreshParentTree();
    }
  };

  // 缩进逻辑：桌面每层 16px，手机端通过边线与回复标示表达深度
  const desktopIndent = Math.min(comment.depth, 4) * 16;

  return (
    <div
      id={`comment-${comment.id}`}
      style={{
        marginLeft: `${desktopIndent}px`,
      }}
      className={cn(
        'group transition-colors rounded-xl p-3 sm:p-4 my-2',
        comment.depth > 0 && 'border-l-2 border-gray-100 sm:border-gray-200 pl-3 sm:pl-4',
        isHighlighted && 'bg-amber-50/80 ring-2 ring-amber-400',
        comment.is_placeholder ? 'bg-gray-50/60 text-gray-400' : 'bg-white hover:bg-gray-50/40'
      )}
    >
      {/* 头部：昵称与时间 */}
      <div className="flex items-center justify-between text-xs mb-1.5 flex-wrap gap-1">
        <div className="flex items-center space-x-2">
          <div
            className={cn(
              'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold',
              comment.is_placeholder
                ? 'bg-gray-200 text-gray-500'
                : comment.is_anonymous
                ? 'bg-purple-100 text-purple-700'
                : 'bg-brand-100 text-brand-700'
            )}
          >
            {comment.is_placeholder ? (
              <EyeOff className="w-3 h-3" />
            ) : (
              <User className="w-3.5 h-3.5" />
            )}
          </div>
          <span
            className={cn(
              'font-medium',
              comment.is_placeholder
                ? 'text-gray-400 italic'
                : comment.is_anonymous
                ? 'text-purple-700 font-semibold'
                : 'text-gray-800 font-semibold'
            )}
          >
            {comment.display_nickname}
          </span>
          {comment.is_anonymous && (
            <span className="text-[10px] bg-purple-50 text-purple-600 border border-purple-200 px-1.5 py-0.2 rounded">
              匿名
            </span>
          )}
        </div>
        <span className="text-gray-400">{formatRelativeTime(comment.created_at)}</span>
      </div>

      {/* 正文：纯文本安全渲染，保留换行 */}
      <div
        className={cn(
          'text-sm leading-relaxed whitespace-pre-wrap break-words pl-8',
          comment.is_placeholder ? 'text-gray-400 italic' : 'text-gray-800'
        )}
      >
        {comment.content}
      </div>

      {/* 底部操作行 */}
      <div className="flex items-center space-x-3 pl-8 mt-2.5 text-xs text-gray-500">
        {/* 占位节点不可直接回复 */}
        {!comment.is_placeholder && comment.depth < 4 && (
          <button
            onClick={() => setShowReplyEditor(!showReplyEditor)}
            className="flex items-center text-gray-500 hover:text-brand-600 transition-colors font-medium"
          >
            <MessageSquare className="w-3.5 h-3.5 mr-1" />
            {showReplyEditor ? '收起' : '回复'}
          </button>
        )}

        {/* 展开/收起回复 */}
        {comment.reply_count > 0 && (
          <button
            onClick={toggleReplies}
            className="flex items-center text-brand-600 hover:text-brand-700 font-medium transition-colors"
          >
            {repliesExpanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5 mr-1" />
                收起回复 ({comment.reply_count})
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5 mr-1" />
                展开回复 ({comment.reply_count})
              </>
            )}
          </button>
        )}
      </div>

      {/* 内嵌回复编辑器 */}
      {showReplyEditor && (
        <div className="pl-8 mt-3">
          <CommentEditor
            vpsId={vpsId}
            parentId={comment.id}
            replyToNickname={comment.display_nickname}
            onSuccess={handleReplySuccess}
            onCancel={() => setShowReplyEditor(false)}
            autoFocus
          />
        </div>
      )}

      {/* 展开的直接子评论列表 */}
      {repliesExpanded && (
        <div className="mt-3 space-y-2">
          {replies.map((reply) => (
            <CommentNode
              key={reply.id}
              comment={reply}
              vpsId={vpsId}
              onRefreshParentTree={onRefreshParentTree}
              highlightId={highlightId}
            />
          ))}

          {loadingReplies && (
            <div className="pl-8 py-2 text-xs text-gray-400 flex items-center">
              <CornerDownRight className="w-3.5 h-3.5 mr-1.5 animate-pulse" />
              正在加载回复...
            </div>
          )}

          {hasMore && !loadingReplies && (
            <div className="pl-8 pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-brand-600"
                onClick={() => loadReplies(nextCursor)}
              >
                加载更多回复...
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
