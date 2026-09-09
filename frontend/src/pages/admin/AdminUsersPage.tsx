import React, { useState, useEffect, useCallback } from 'react';
import { User, Role } from '@/types/api';
import { apiClient } from '@/lib/http/client';
import { formatDate } from '@/lib/format/date';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { Pagination } from '@/components/ui/Pagination';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Users, KeyRound, Shield } from 'lucide-react';
import { isAppError } from '@/lib/http/errors';
import { BusinessCode } from '@/types/error';

export const AdminUsersPage: React.FC = () => {
  const { toast } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [enabled, setEnabled] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 重置密码弹窗
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      let url = `/admin/users?page=${page}&page_size=${pageSize}`;
      if (q.trim()) url += `&q=${encodeURIComponent(q.trim())}`;
      if (role) url += `&role=${role}`;
      if (enabled !== '') url += `&enabled=${enabled}`;

      const res = await apiClient.get<{ items: User[]; total: number }>(url);
      setUsers(res.data.items);
      setTotal(res.data.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '获取用户列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, q, role, enabled]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // 修改角色 (带末位管理员保护)
  const handleChangeRole = async (user: User) => {
    const nextRole: Role = user.role === 'admin' ? 'user' : 'admin';
    const confirmMsg =
      nextRole === 'admin'
        ? `确认将用户【${user.nickname} (${user.username})】提升为管理员吗？`
        : `确认将管理员【${user.nickname} (${user.username})】降级为普通用户吗？`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await apiClient.patch(`/admin/users/${user.id}`, { role: nextRole });
      toast('success', `角色已更新为 ${nextRole === 'admin' ? '管理员' : '普通用户'}`);
      fetchUsers();
    } catch (err: unknown) {
      if (isAppError(err) && err.code === BusinessCode.LAST_ADMIN_REQUIRED) {
        toast('error', '末位管理员保护：系统必须保留至少一个启用的管理员！');
      } else {
        toast('error', isAppError(err) ? err.message : '更新角色失败');
      }
    }
  };

  // 启禁用用户 (带末位管理员保护)
  const handleToggleEnabled = async (user: User) => {
    const nextEnabled = !user.enabled;
    const confirmMsg = nextEnabled
      ? `确认恢复启用用户【${user.nickname}】吗？`
      : `确认停用用户【${user.nickname}】吗？该用户将无法登录，其所有活跃会话将立即撤销！`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await apiClient.patch(`/admin/users/${user.id}`, { enabled: nextEnabled });
      toast('success', `账号已${nextEnabled ? '启用' : '停用'}`);
      fetchUsers();
    } catch (err: unknown) {
      if (isAppError(err) && err.code === BusinessCode.LAST_ADMIN_REQUIRED) {
        toast('error', '末位管理员保护：不能停用系统中最后一个启用的管理员！');
      } else {
        toast('error', isAppError(err) ? err.message : '操作失败');
      }
    }
  };

  // 强制撤销会话
  const handleRevokeSessions = async (userId: string) => {
    if (!window.confirm('确定要强制撤销该用户的所有登录设备会话吗？对方将被迫重新登录。')) return;

    try {
      const res = await apiClient.post<{ revoked_count: number }>(
        `/admin/users/${userId}/revoke-sessions`,
        {}
      );
      toast('success', `已强制撤销该用户的 ${res.data.revoked_count} 个会话`);
    } catch (err: unknown) {
      toast('error', isAppError(err) ? err.message : '撤销会话失败');
    }
  };

  // 重置密码
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUser) return;
    const pwdRuneCount = [...newPassword].length;
    const pwdByteLen = new TextEncoder().encode(newPassword).length;
    if (pwdRuneCount < 12 || pwdRuneCount > 128 || pwdByteLen > 512) {
      toast('error', '新密码长度须在 12~128 个字符之间（UTF-8 编码不超过 512 字节）');
      return;
    }

    try {
      setResetting(true);
      await apiClient.post(`/admin/users/${resetUser.id}/reset-password`, {
        new_password: newPassword,
      });
      toast('success', `用户【${resetUser.nickname}】密码已重置，其会话已全部撤销`);
      setResetUser(null);
      setNewPassword('');
    } catch (err: unknown) {
      toast('error', isAppError(err) ? err.message : '重置密码失败');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight flex items-center">
            <Users className="w-6 h-6 text-brand-600 mr-2.5" />
            用户与权限管理
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            管理全站注册用户角色、账号启停状态、会话强制下线及密码重置
          </p>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-4 rounded-2xl border border-gray-200">
        <Input
          placeholder="按用户名或昵称搜索..."
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />

        <Select
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
          options={[
            { value: '', label: '全部角色' },
            { value: 'admin', label: '系统管理员 (admin)' },
            { value: 'user', label: '普通用户 (user)' },
          ]}
        />

        <Select
          value={enabled}
          onChange={(e) => {
            setEnabled(e.target.value);
            setPage(1);
          }}
          options={[
            { value: '', label: '全部启用状态' },
            { value: 'true', label: '正常启用' },
            { value: 'false', label: '已停用' },
          ]}
        />
      </div>

      {/* 用户表格 */}
      {loading ? (
        <LoadingSpinner label="正在读取用户列表..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchUsers} />
      ) : users.length === 0 ? (
        <EmptyState title="未找到用户" />
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-600">
              <thead className="bg-gray-50 text-gray-400 font-semibold border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">用户名 / ID</th>
                  <th className="py-3 px-4">展示昵称</th>
                  <th className="py-3 px-4">角色</th>
                  <th className="py-3 px-4">状态</th>
                  <th className="py-3 px-4">注册时间</th>
                  <th className="py-3 px-4 text-right">管理操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-mono font-bold text-gray-900">{u.username}</div>
                      <div className="text-[11px] text-gray-400">UID: {u.id}</div>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-gray-800">{u.nickname}</td>
                    <td className="py-3.5 px-4">
                      <Badge variant={u.role === 'admin' ? 'purple' : 'blue'}>
                        {u.role === 'admin' ? '管理员' : '普通用户'}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge variant={u.enabled ? 'green' : 'gray'}>
                        {u.enabled ? '启用' : '停用'}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 text-gray-400">{formatDate(u.created_at)}</td>
                    <td className="py-3.5 px-4 text-right space-x-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleChangeRole(u)}
                        title={u.role === 'admin' ? '降级为普通用户' : '提升为管理员'}
                      >
                        <Shield className="w-3 h-3 mr-1" />
                        {u.role === 'admin' ? '降权' : '设管理'}
                      </Button>
                      <Button
                        variant={u.enabled ? 'ghost' : 'secondary'}
                        size="sm"
                        className={u.enabled ? 'text-rose-600 hover:bg-rose-50' : 'text-emerald-700'}
                        onClick={() => handleToggleEnabled(u)}
                      >
                        {u.enabled ? '停用' : '启用'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevokeSessions(u.id)}
                        className="text-gray-500 hover:text-gray-800"
                        title="强退该用户所有登录设备"
                      >
                        强退
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setResetUser(u);
                          setNewPassword('');
                        }}
                      >
                        <KeyRound className="w-3 h-3 mr-1" />
                        重置密码
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={(p) => setPage(p)} />
        </div>
      )}

      {/* 重置密码弹窗 */}
      <Dialog
        isOpen={Boolean(resetUser)}
        onClose={() => setResetUser(null)}
        title="管理员重置用户密码"
        description={`正在为用户【${resetUser?.username} (${resetUser?.nickname})】设置新密码。修改后将同时撤销其所有会话。`}
      >
        <form onSubmit={handleResetPassword} className="space-y-4 pt-2">
          <Input
            label="新密码"
            type="password"
            placeholder="12~128位字符"
            helperText="长度须为 12~128 位字符"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={resetting}
            autoFocus
          />

          <div className="flex justify-end space-x-2 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setResetUser(null)}
              disabled={resetting}
            >
              取消
            </Button>
            <Button type="submit" variant="danger" size="sm" loading={resetting}>
              确认重置密码
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};
