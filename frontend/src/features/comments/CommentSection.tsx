import React, { useState, useEffect, useCallback } from 'react';
import { CommentPublic, CommentPrivate, CommentSearchItem } from '@/types/api';
import { apiClient } from '@/lib/http/client';
import { CommentNode } from './CommentNode';
import { CommentEditor } from './CommentEditor';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { MessageSquare, Search, X, ArrowDown } from 'lucide-react';

export interface CommentSectionProps {
  vpsId: string;
}

export const CommentSection: React.FC<CommentSectionProps> = ({ vpsId }) => {
  const [rootComments, setRootComments] = useState<CommentPublic[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // 搜索状态
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CommentSearchItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const fetchRootComments = useCallback(
    async (cursor?: string | null) => {
      try {
        if (!cursor) setLoading(true);
        else setLoadingMore(true);

        const url = cursor
          ? `/vps/${vpsId}/comments?cursor=${encodeURIComponent(cursor)}`
          : `/vps/${vpsId}/comments`;

        const res = await apiClient.get<{ items: CommentPublic[]; next_cursor: string | null; has_more: boolean }>(
          url
        );

        if (cursor) {
          setRootComments((prev) => [...prev, ...res.data.items]);
        } else {
          setRootComments(res.data.items);
        }
        setNextCursor(res.data.next_cursor);
        setHasMore(res.data.has_more);
      } catch {
        // 忽略
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [vpsId]
  );

  useEffect(() => {
    fetchRootComments();
  }, [fetchRootComments]);

  const handleCommentCreated = (_newComment: CommentPrivate) => {
    fetchRootComments();
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim().length < 2) return;

    try {
      setSearching(true);
      const res = await apiClient.get<{ items: CommentSearchItem[] }>(
        `/vps/${vpsId}/comments/search?q=${encodeURIComponent(searchQuery.trim())}`
      );
      setSearchResults(res.data.items);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
    setHighlightId(null);
  };

  const jumpToComment = (targetId: string, rootId: string) => {
    setHighlightId(targetId);
    const elem = document.getElementById(`comment-${targetId}`) || document.getElementById(`comment-${rootId}`);
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-200 pb-4">
        <div className="flex items-center space-x-2">
          <MessageSquare className="w-5 h-5 text-brand-600" />
          <h2 className="text-lg font-bold text-gray-900">讨论与答疑</h2>
        </div>

        {/* 评论搜索表单 */}
        <form onSubmit={handleSearch} className="flex items-center space-x-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-60">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索评论正文 (2~100字)..."
              className="w-full h-9 rounded-lg border border-gray-200 pl-8 pr-7 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white"
            />
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
            {searchQuery && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={searchQuery.trim().length < 2 || searching}
            loading={searching}
          >
            搜索
          </Button>
        </form>
      </div>

      {/* 搜索结果展示 */}
      {searchResults !== null && (
        <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-4 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-brand-900">
            <span>找到 {searchResults.length} 条匹配评论：</span>
            <button onClick={clearSearch} className="text-brand-600 hover:underline">
              关闭搜索结果
            </button>
          </div>
          {searchResults.length === 0 ? (
            <p className="text-xs text-gray-500 py-2 text-center">未找到包含关键词的公开评论。</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {searchResults.map((item) => (
                <div
                  key={item.id}
                  onClick={() => jumpToComment(item.id, item.root_comment_id)}
                  className="rounded-lg bg-white p-2.5 border border-brand-100 hover:border-brand-300 text-xs cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-between text-gray-400 mb-1">
                    <span className="font-semibold text-gray-700">{item.display_nickname}</span>
                    <span className="inline-flex items-center text-brand-600 font-medium">
                      定位评论 <ArrowDown className="w-3 h-3 ml-0.5" />
                    </span>
                  </div>
                  <p className="text-gray-800 line-clamp-2">{item.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 发表根评论输入框 */}
      <CommentEditor vpsId={vpsId} onSuccess={handleCommentCreated} />

      {/* 评论列表 */}
      {loading ? (
        <LoadingSpinner label="正在拉取评论..." />
      ) : rootComments.length === 0 ? (
        <EmptyState
          title="暂无评论"
          description="该套餐还没有公开讨论，成为第一个发言的人吧！"
        />
      ) : (
        <div className="space-y-1">
          {rootComments.map((root) => (
            <CommentNode
              key={root.id}
              comment={root}
              vpsId={vpsId}
              onRefreshParentTree={fetchRootComments}
              highlightId={highlightId}
            />
          ))}

          {hasMore && (
            <div className="text-center pt-4">
              <Button
                variant="outline"
                size="sm"
                loading={loadingMore}
                onClick={() => fetchRootComments(nextCursor)}
              >
                加载更多评论
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
