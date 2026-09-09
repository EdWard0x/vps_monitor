import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { CommentAdmin, Visibility } from '@/types/api';
import { apiClient } from '@/lib/http/client';
import { formatDate } from '@/lib/format/date';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import {
  MessageSquare,
  CheckCircle,
  XCircle,
  Eye,
  Trash2,
  ExternalLink,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { isAppError } from '@/lib/http/errors';

export const AdminCommentsPage: React.FC = () => {
  const { toast } = useToast();

  const [comments, setComments] = useState<CommentAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  // 默认过滤为待审核 (visibility = 2)
  const [visibility, setVisibility] = useState<string>('2');
  const [vpsId, setVpsId] = useState('');
  const [isAnonymous, setIsAnonymous] = useState('');
  const [q, setQ] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 展开作者信息的记录集合
  const [expandedAuthorIds, setExpandedAuthorIds] = useState<Record<string, boolean>>({});

  const fetchComments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      let url = `/admin/comments?page=${page}&page_size=${pageSize}`;
      if (visibility) url += `&visibility=${visibility}`;
      if (vpsId.trim()) url += `&vps_id=${encodeURIComponent(vpsId.trim())}`;
      if (isAnonymous !== '') url += `&is_anonymous=${isAnonymous}`;
      if (q.trim()) url += `&q=${encodeURIComponent(q.trim())}`;

      const res = await apiClient.get<{ items: CommentAdmin[]; total: number }>(url);
      setComments(res.data.items);
      setTotal(res.data.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '获取审核评论失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, visibility, vpsId, isAnonymous, q]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // 修改可见性 (通过 1，拒绝/隐藏 3)
  const handleSetVisibility = async (commentId: string, nextVisibility: 1 | 3) => {
    try {
      await apiClient.patch(`/admin/comments/${commentId}/visibility`, {
        visibility: nextVisibility,
      });
      toast('success', nextVisibility === 1 ? '评论已审核通过并公开' : '评论已隐藏/拒绝');
      fetchComments();
    } catch (err: unknown) {
      toast('error', isAppError(err) ? err.message : '操作失败');
    }
  };

  // 彻底删除正文并占位
  const handleDelete = async (commentId: string) => {
    if (!window.confirm('警告：确认永久删除该评论正文吗？正文将被清空并作为占位符保留其子树，该操作不可恢复！')) return;

    try {
      await apiClient.delete(`/admin/comments/${commentId}`);
      toast('success', '评论正文已清空并转为删除占位符');
      fetchComments();
    } catch (err: unknown) {
      toast('error', isAppError(err) ? err.message : '删除失败');
    }
  };

  const toggleAuthorDetails = (id: string) => {
    setExpandedAuthorIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderVisibilityBadge = (v: Visibility) => {
    switch (v) {
      case 1:
        return <Badge variant="green">公开展示</Badge>;
      case 2:
        return <Badge variant="yellow">待审核</Badge>;
      case 3:
        return <Badge variant="red">已拒绝/隐藏</Badge>;
      case 4:
        return <Badge variant="gray">已删除占位</Badge>;
      default:
        return <Badge variant="gray">未知</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight flex items-center">
            <MessageSquare className="w-6 h-6 text-brand-600 mr-2.5" />
            评论审核与管理
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            审核待处理讨论、处理违规内容或隐藏评论（默认优先展示待审核列表）
          </p>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-white p-4 rounded-2xl border border-gray-200">
        <Select
          value={visibility}
          onChange={(e) => {
            setVisibility(e.target.value);
            setPage(1);
          }}
          options={[
            { value: '2', label: '待审核 (默认)' },
            { value: '1', label: '已公开' },
            { value: '3', label: '已隐藏/拒绝' },
            { value: '4', label: '已删除占位' },
            { value: '', label: '全部状态' },
          ]}
        />

        <Input
          placeholder="按评论正文关键词搜索..."
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />

        <Input
          placeholder="按 VPS ID 筛选..."
          value={vpsId}
          onChange={(e) => {
            setVpsId(e.target.value);
            setPage(1);
          }}
        />

        <Select
          value={isAnonymous}
          onChange={(e) => {
            setIsAnonymous(e.target.value);
            setPage(1);
          }}
          options={[
            { value: '', label: '全部发布形式' },
            { value: 'true', label: '仅匿名评论' },
            { value: 'false', label: '仅实名评论' },
          ]}
        />
      </div>

      {/* 评论审核列表 */}
      {loading ? (
        <LoadingSpinner label="正在拉取待审与管理评论..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchComments} />
      ) : comments.length === 0 ? (
        <EmptyState
          title="当前没有匹配的评论"
          description={visibility === '2' ? '太棒了！当前待审核队列已全部处理完毕。' : '没有符合当前筛选条件的评论。'}
        />
      ) : (
        <div className="space-y-3">
          {comments.map((c) => {
            const isAuthorExpanded = Boolean(expandedAuthorIds[c.id]);

            return (
              <div
                key={c.id}
                className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between gap-4"
              >
                <div>
                  {/* 头部元信息 */}
                  <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap text-xs">
                    <div className="flex items-center space-x-2">
                      {renderVisibilityBadge(c.visibility)}
                      {c.is_anonymous && (
                        <span className="text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded text-[11px] font-medium">
                          前台匿名
                        </span>
                      )}
                      <span className="text-gray-400">评论 #{c.id}</span>
                      <span className="text-gray-400">· 深度: {c.depth}</span>
                    </div>
                    <span className="text-gray-400">{formatDate(c.created_at)}</span>
                  </div>

                  {/* 正文 */}
                  <div className="text-sm text-gray-800 whitespace-pre-wrap break-words bg-gray-50/70 p-3 rounded-xl">
                    {c.visibility === 4 ? (
                      <span className="text-gray-400 italic">（该评论正文已由管理员清空）</span>
                    ) : (
                      c.content
                    )}
                  </div>

                  {/* 后台可查真实作者折叠信息 */}
                  <div className="mt-3 pt-2 text-xs">
                    <button
                      onClick={() => toggleAuthorDetails(c.id)}
                      className="inline-flex items-center text-gray-500 hover:text-gray-800 font-medium"
                    >
                      <ShieldAlert className="w-3.5 h-3.5 mr-1 text-amber-600" />
                      真实作者审计信息（仅管理员可见）
                      {isAuthorExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5 ml-1" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 ml-1" />
                      )}
                    </button>

                    {isAuthorExpanded && (
                      <div className="mt-2 p-2.5 rounded-lg bg-amber-50/70 border border-amber-200 text-amber-900 text-xs flex flex-wrap gap-4">
                        <span>
                          真实用户名：<strong className="font-mono">{c.author.username}</strong>
                        </span>
                        <span>
                          用户昵称：<strong>{c.author.nickname}</strong>
                        </span>
                        <span>UID: {c.author.id}</span>
                        <span className="text-amber-700 text-[11px]">
                          （注意：前台公开接口绝对不输出此信息）
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 底部操作行 */}
                <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs flex-wrap gap-2">
                  <Link
                    to={`/vps/${c.vps_id}`}
                    className="inline-flex items-center text-brand-600 hover:text-brand-700 font-medium"
                  >
                    跳转所属 VPS (ID: {c.vps_id})
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </Link>

                  <div className="flex items-center space-x-2">
                    {/* 待审核时：通过 (1) 或 拒绝/隐藏 (3) */}
                    {c.visibility === 2 && (
                      <>
                        <Button
                          variant="primary"
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-xs"
                          onClick={() => handleSetVisibility(c.id, 1)}
                        >
                          <CheckCircle className="w-3.5 h-3.5 mr-1" />
                          通过公开
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="text-rose-700 hover:bg-rose-50 text-xs"
                          onClick={() => handleSetVisibility(c.id, 3)}
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1" />
                          拒绝入库
                        </Button>
                      </>
                    )}

                    {/* 已公开时：可隐藏 (3) */}
                    {c.visibility === 1 && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleSetVisibility(c.id, 3)}
                        className="text-xs"
                      >
                        <XCircle className="w-3.5 h-3.5 mr-1" />
                        隐藏此评论
                      </Button>
                    )}

                    {/* 已隐藏时：可重新公开 (1) */}
                    {c.visibility === 3 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetVisibility(c.id, 1)}
                        className="text-emerald-700 hover:bg-emerald-50 text-xs"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        恢复公开
                      </Button>
                    )}

                    {/* 未删除状态下均可永久删除正文并占位 */}
                    {c.visibility !== 4 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(c.id)}
                        className="text-rose-600 hover:bg-rose-50 text-xs"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        永久删除正文
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={(p) => setPage(p)} />
        </div>
      )}
    </div>
  );
};
