import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { CommentPrivate, Visibility } from '@/types/api';
import { apiClient } from '@/lib/http/client';
import { formatDate } from '@/lib/format/date';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Pagination } from '@/components/ui/Pagination';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { MessageSquare, Trash2, ExternalLink, ShieldCheck } from 'lucide-react';
import { isAppError } from '@/lib/http/errors';

export const MyCommentsPage: React.FC = () => {
  const { toast } = useToast();

  const [comments, setComments] = useState<CommentPrivate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [visibility, setVisibility] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMyComments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      let url = `/me/comments?page=${page}&page_size=${pageSize}`;
      if (visibility) {
        url += `&visibility=${visibility}`;
      }
      const res = await apiClient.get<{ items: CommentPrivate[]; total: number; page: number }>(url);
      setComments(res.data.items);
      setTotal(res.data.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '获取评论列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, visibility]);

  useEffect(() => {
    fetchMyComments();
  }, [fetchMyComments]);

  const handleDelete = async (commentId: string) => {
    if (!window.confirm('确定要删除这条评论吗？删除后正文将清空并以占位符保留其子评论。')) return;

    try {
      await apiClient.delete(`/comments/${commentId}`);
      toast('success', '评论已删除');
      fetchMyComments();
    } catch (err: unknown) {
      toast('error', isAppError(err) ? err.message : '删除失败');
    }
  };

  const renderVisibilityBadge = (v: Visibility) => {
    switch (v) {
      case 1:
        return <Badge variant="green">公开正常</Badge>;
      case 2:
        return <Badge variant="yellow">待审核</Badge>;
      case 3:
        return <Badge variant="red">已隐藏/拒绝</Badge>;
      case 4:
        return <Badge variant="gray">已删除占位</Badge>;
      default:
        return <Badge variant="gray">未知</Badge>;
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight flex items-center">
            <MessageSquare className="w-6 h-6 text-brand-600 mr-2.5" />
            我的评论管理
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            查看您公开发表或匿名发表的历史评论，包括待审核及隐藏项
          </p>
        </div>

        <div className="w-44">
          <Select
            value={visibility}
            onChange={(e) => {
              setVisibility(e.target.value);
              setPage(1);
            }}
            options={[
              { value: '', label: '全部状态' },
              { value: '1', label: '公开' },
              { value: '2', label: '待审核' },
              { value: '3', label: '已隐藏' },
              { value: '4', label: '已删除' },
            ]}
          />
        </div>
      </div>

      {loading ? (
        <LoadingSpinner label="正在拉取您的评论记录..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchMyComments} />
      ) : comments.length === 0 ? (
        <EmptyState
          title="暂无评论记录"
          description="您还没有发表过任何评论。去探索心仪的 VPS 套餐并参与讨论吧！"
        />
      ) : (
        <div className="space-y-3">
          {comments.map((c) => (
            <div
              key={c.id}
              className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap text-xs">
                  <div className="flex items-center space-x-2">
                    {renderVisibilityBadge(c.visibility)}
                    {c.is_anonymous && (
                      <span className="inline-flex items-center text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded text-[11px] font-medium">
                        <ShieldCheck className="w-3 h-3 mr-1" />
                        匿名发布
                      </span>
                    )}
                    <span className="text-gray-400">评论 ID: {c.id}</span>
                  </div>
                  <span className="text-gray-400">{formatDate(c.created_at)}</span>
                </div>

                <div className="text-sm text-gray-800 whitespace-pre-wrap break-words">
                  {c.visibility === 4 ? (
                    <span className="text-gray-400 italic">（该评论正文已清空）</span>
                  ) : (
                    c.content
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                <Link
                  to={`/vps/${c.vps_id}`}
                  className="inline-flex items-center text-brand-600 hover:text-brand-700 font-medium"
                >
                  查看关联套餐
                  <ExternalLink className="w-3 h-3 ml-1" />
                </Link>

                {c.can_delete && c.visibility !== 4 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(c.id)}
                    className="text-red-600 hover:bg-red-50 text-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    删除评论
                  </Button>
                )}
              </div>
            </div>
          ))}

          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={(p) => setPage(p)}
          />
        </div>
      )}
    </div>
  );
};
