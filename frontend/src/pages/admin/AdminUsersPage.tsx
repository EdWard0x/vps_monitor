import React, { useState, useEffect, useCallback } from 'react';
import { AdminUser } from '@/types/user';
import { Role } from '@/types/auth';
import * as userApi from '@/api/user';
import * as frozeApi from '@/api/froze';
import { UserFilter } from '@/features/user/UserFilter';
import { UserTable } from '@/features/user/UserTable';
import { UserEditDialog } from '@/features/user/UserEditDialog';
import { UserRoleDialog } from '@/features/user/UserRoleDialog';
import { UserPasswordResetDialog } from '@/features/user/UserPasswordResetDialog';
import { UserFreezeDialog } from '@/features/user/UserFreezeDialog';
import { useToast } from '@/components/ui/Toast';
import { Pagination } from '@/components/ui/Pagination';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { NotImplementedCard } from '@/pages/ErrorPages';
import { isAppError, getErrorMessage } from '@/lib/http/errors';
import { BusinessCode } from '@/types/error';
import { useAuth } from '@/app/AuthContext';
import { Users } from 'lucide-react';

export const AdminUsersPage: React.FC = () => {
  const { user: currentUser, reloadProfile, logout } = useAuth();
  const { toast } = useToast();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [frozen, setFrozen] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNotImplemented, setIsNotImplemented] = useState(false);

  // 弹窗状态
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [resetPwdDialogOpen, setResetPwdDialogOpen] = useState(false);
  const [freezeDialogOpen, setFreezeDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setIsNotImplemented(false);

      const res = await userApi.adminListUsers({
        page,
        page_size: pageSize,
        q: q.trim() || undefined,
        role: role ? (role as Role) : undefined,
        frozen: frozen !== '' ? frozen === 'true' : undefined,
      });

      setUsers(res.data.items);
      setTotal(res.data.total);
    } catch (err: unknown) {
      if (isAppError(err) && (err.code === BusinessCode.NOT_IMPLEMENTED || err.status === 501)) {
        setIsNotImplemented(true);
      } else {
        setError(getErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, q, role, frozen]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // 修改昵称
  const handleUpdateNickname = async (userId: string, nickname: string) => {
    try {
      setSubmitting(true);
      await userApi.adminUpdateUser({ id: userId, nickname });
      toast({ type: 'success', title: '更新成功', message: '用户昵称已更新' });
      setEditDialogOpen(false);
      if (userId === currentUser?.id) {
        await reloadProfile();
      }
      fetchUsers();
    } catch (err) {
      if (isAppError(err) && (err.code === BusinessCode.NOT_IMPLEMENTED || err.status === 501)) {
        toast({ type: 'error', title: '功能尚未实现', message: '后端用户更新接口返回 HTTP 501' });
      } else {
        toast({ type: 'error', title: '更新失败', message: getErrorMessage(err) });
      }
    } finally {
      setSubmitting(false);
    }
  };

  // 修改角色
  const handleUpdateRole = async (userId: string, targetRole: Role) => {
    try {
      setSubmitting(true);
      await userApi.adminUpdateUserRole({ id: userId, role: targetRole });
      toast({ type: 'success', title: '角色已更新', message: '用户权限级别已调整' });
      setRoleDialogOpen(false);
      // 若当前登录用户自身被调整角色，及时更新自身权限
      if (userId === currentUser?.id) {
        await reloadProfile();
      }
      fetchUsers();
    } catch (err) {
      if (isAppError(err) && err.code === BusinessCode.RESOURCE_CONFLICT) {
        toast({
          type: 'error',
          title: '无法调整角色',
          message: '系统必须保留至少一个可用且已验证邮箱的管理员账号。',
        });
      } else if (isAppError(err) && err.code === BusinessCode.MAIL_REQUIRED) {
        toast({
          type: 'error',
          title: '无法提升为管理员',
          message: '提升管理员要求目标账号已绑定并验证安全邮箱，请引导用户先完成邮箱验证。',
        });
      } else if (isAppError(err) && (err.code === BusinessCode.NOT_IMPLEMENTED || err.status === 501)) {
        toast({ type: 'error', title: '功能尚未实现', message: '后端角色调整接口返回 HTTP 501' });
      } else {
        toast({ type: 'error', title: '更新失败', message: getErrorMessage(err) });
      }
    } finally {
      setSubmitting(false);
    }
  };

  // 管理员强制重置密码
  const handleResetPassword = async (userId: string, newPassword: string) => {
    try {
      setSubmitting(true);
      await userApi.adminResetUserPassword({ user_id: userId, new_password: newPassword });
      toast({ type: 'success', title: '密码已重置', message: '目标用户所有现有登录凭证已失效' });
      setResetPwdDialogOpen(false);
    } catch (err) {
      if (isAppError(err) && (err.code === BusinessCode.NOT_IMPLEMENTED || err.status === 501)) {
        toast({ type: 'error', title: '功能尚未实现', message: '后端重置密码接口返回 HTTP 501' });
      } else {
        toast({ type: 'error', title: '重置失败', message: getErrorMessage(err) });
      }
    } finally {
      setSubmitting(false);
    }
  };

  // 冻结 / 解冻
  const handleToggleFreeze = async (userId: string, targetFrozen: boolean) => {
    try {
      setSubmitting(true);
      const res = targetFrozen
        ? await frozeApi.freezeUser({ user_id: userId })
        : await frozeApi.unfreezeUser({ user_id: userId });

      const { frozen: isFrozen, cache_synced } = res.data;

      // 更新界面状态
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, frozen: isFrozen } : u))
      );

      if (!cache_synced) {
        toast({
          type: 'warning',
          title: isFrozen ? '账号已冻结' : '账号已解冻',
          message: '数据库已更新，但 Redis 缓存同步未完成，建议稍后重试以确保一致。',
        });
      } else {
        toast({
          type: 'success',
          title: isFrozen ? '账号已冻结' : '账号已解冻',
          message: isFrozen ? '目标用户已被全设备冻结' : '账号已恢复正常，用户需重新登录',
        });
      }

      setFreezeDialogOpen(false);

      // 若当前管理员冻结了自身，清理登录态退出
      if (userId === currentUser?.id && isFrozen) {
        await logout();
      }
    } catch (err) {
      if (isAppError(err) && err.code === BusinessCode.RESOURCE_CONFLICT) {
        toast({
          type: 'error',
          title: '操作被拒绝',
          message: '系统必须保留至少一个正常可用的管理员账号，无法冻结最后一个管理员。',
        });
      } else if (isAppError(err) && (err.code === BusinessCode.NOT_IMPLEMENTED || err.status === 501)) {
        toast({ type: 'error', title: '功能尚未实现', message: '后端冻结/解冻端点返回 HTTP 501' });
      } else {
        toast({ type: 'error', title: '操作失败', message: getErrorMessage(err) });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center">
          <Users className="w-6 h-6 text-brand-600 mr-2.5" />
          用户与权限管理
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          查看已注册账号、分配管理员权限、重置用户密码及执行全设备账号冻结/解冻
        </p>
      </div>

      <UserFilter
        q={q}
        onQChange={(val) => {
          setQ(val);
          setPage(1);
        }}
        role={role}
        onRoleChange={(val) => {
          setRole(val);
          setPage(1);
        }}
        frozen={frozen}
        onFrozenChange={(val) => {
          setFrozen(val);
          setPage(1);
        }}
      />

      {isNotImplemented ? (
        <NotImplementedCard
          title="用户管理接口尚未实现 (HTTP 501)"
          description="后端端点 GET /api/v1/admin/user/list 正在重构中，待后端接入后即可管理用户与执行冻结。"
        />
      ) : loading ? (
        <LoadingSpinner label="正在读取用户管理列表..." />
      ) : error ? (
        <ErrorState title="加载失败" description={error} onRetry={fetchUsers} />
      ) : users.length === 0 ? (
        <EmptyState title="未找到用户" description="当前筛选条件下没有匹配的用户记录。" />
      ) : (
        <div className="space-y-4">
          <UserTable
            users={users}
            onEditUser={(u) => {
              setSelectedUser(u);
              setEditDialogOpen(true);
            }}
            onEditRole={(u) => {
              setSelectedUser(u);
              setRoleDialogOpen(true);
            }}
            onResetPassword={(u) => {
              setSelectedUser(u);
              setResetPwdDialogOpen(true);
            }}
            onToggleFreeze={(u) => {
              setSelectedUser(u);
              setFreezeDialogOpen(true);
            }}
          />
          <Pagination
            page={page}
            total={total}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </div>
      )}

      <UserEditDialog
        isOpen={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        user={selectedUser}
        onSubmit={handleUpdateNickname}
        loading={submitting}
      />

      <UserRoleDialog
        isOpen={roleDialogOpen}
        onClose={() => setRoleDialogOpen(false)}
        user={selectedUser}
        onSubmit={handleUpdateRole}
        loading={submitting}
      />

      <UserPasswordResetDialog
        isOpen={resetPwdDialogOpen}
        onClose={() => setResetPwdDialogOpen(false)}
        user={selectedUser}
        onSubmit={handleResetPassword}
        loading={submitting}
      />

      <UserFreezeDialog
        isOpen={freezeDialogOpen}
        onClose={() => setFreezeDialogOpen(false)}
        user={selectedUser}
        onConfirm={handleToggleFreeze}
        loading={submitting}
      />
    </div>
  );
};
