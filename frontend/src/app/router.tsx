import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AuthGuard, AdminGuard, GuestGuard } from './Guards';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { NotFoundPage, ForbiddenPage } from '@/pages/ErrorPages';

// 公开页面
import { HomePage } from '@/pages/public/HomePage';
import { MerchantsPage } from '@/pages/public/MerchantsPage';
import { MerchantDetailPage } from '@/pages/public/MerchantDetailPage';
import { VpsDetailPage } from '@/pages/public/VpsDetailPage';

// 认证与用户页面
import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { AccountPage } from '@/pages/account/AccountPage';
import { MyCommentsPage } from '@/pages/account/MyCommentsPage';

// 管理员后台页面（懒加载，优化首屏包体积）
const AdminDashboardPage = lazy(() =>
  import('@/pages/admin/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage }))
);
const AdminMerchantsPage = lazy(() =>
  import('@/pages/admin/AdminMerchantsPage').then((m) => ({ default: m.AdminMerchantsPage }))
);
const AdminVpsPage = lazy(() =>
  import('@/pages/admin/AdminVpsPage').then((m) => ({ default: m.AdminVpsPage }))
);
const AdminVpsDetailPage = lazy(() =>
  import('@/pages/admin/AdminVpsDetailPage').then((m) => ({ default: m.AdminVpsDetailPage }))
);
const AdminMonitorsPage = lazy(() =>
  import('@/pages/admin/AdminMonitorsPage').then((m) => ({ default: m.AdminMonitorsPage }))
);
const AdminUsersPage = lazy(() =>
  import('@/pages/admin/AdminUsersPage').then((m) => ({ default: m.AdminUsersPage }))
);
const AdminCommentsPage = lazy(() =>
  import('@/pages/admin/AdminCommentsPage').then((m) => ({ default: m.AdminCommentsPage }))
);
const AdminSettingsPage = lazy(() =>
  import('@/pages/admin/AdminSettingsPage').then((m) => ({ default: m.AdminSettingsPage }))
);

const SuspenseWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense fallback={<LoadingSpinner label="加载管理页面中..." />}>{children}</Suspense>
);

export const router = createBrowserRouter([
  // 前台公开与用户路由
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'merchants', element: <MerchantsPage /> },
      { path: 'merchants/:id', element: <MerchantDetailPage /> },
      { path: 'vps/:id', element: <VpsDetailPage /> },
      {
        path: 'login',
        element: (
          <GuestGuard>
            <LoginPage />
          </GuestGuard>
        ),
      },
      {
        path: 'register',
        element: (
          <GuestGuard>
            <RegisterPage />
          </GuestGuard>
        ),
      },
      {
        path: 'account',
        element: (
          <AuthGuard>
            <AccountPage />
          </AuthGuard>
        ),
      },
      {
        path: 'account/comments',
        element: (
          <AuthGuard>
            <MyCommentsPage />
          </AuthGuard>
        ),
      },
      { path: '403', element: <ForbiddenPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },

  // 管理后台路由（按路由组懒加载与权限守卫）
  {
    path: '/admin',
    element: (
      <AdminGuard>
        <AdminLayout />
      </AdminGuard>
    ),
    children: [
      {
        index: true,
        element: (
          <SuspenseWrapper>
            <AdminDashboardPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'merchants',
        element: (
          <SuspenseWrapper>
            <AdminMerchantsPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'vps',
        element: (
          <SuspenseWrapper>
            <AdminVpsPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'vps/:id',
        element: (
          <SuspenseWrapper>
            <AdminVpsDetailPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'monitors',
        element: (
          <SuspenseWrapper>
            <AdminMonitorsPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'users',
        element: (
          <SuspenseWrapper>
            <AdminUsersPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'comments',
        element: (
          <SuspenseWrapper>
            <AdminCommentsPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'settings',
        element: (
          <SuspenseWrapper>
            <AdminSettingsPage />
          </SuspenseWrapper>
        ),
      },
    ],
  },
]);
