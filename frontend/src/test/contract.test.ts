import { describe, it, expect } from 'vitest';
import * as authApi from '../api/auth';
import * as userApi from '../api/user';
import * as frozeApi from '../api/froze';
import * as merchantApi from '../api/merchant';
import * as vpsApi from '../api/vps';
import * as stockApi from '../api/stock';
import * as settingsApi from '../api/settings';
import * as dashboardApi from '../api/dashboard';
import { BusinessCode, BusinessCodeMessages } from '../types/error';
import { routes } from '../app/router';

describe('Frontend Refactor Skeleton Contract Tests', () => {
  it('API modules export all required interface methods according to contract', () => {
    // Auth endpoints
    expect(typeof authApi.issueCSRF).toBe('function');
    expect(typeof authApi.register).toBe('function');
    expect(typeof authApi.login).toBe('function');
    expect(typeof authApi.refresh).toBe('function');
    expect(typeof authApi.logout).toBe('function');

    // User & Admin endpoints
    expect(typeof userApi.getMe).toBe('function');
    expect(typeof userApi.updateMe).toBe('function');
    expect(typeof userApi.changePassword).toBe('function');
    expect(typeof userApi.adminListUsers).toBe('function');
    expect(typeof userApi.adminGetUserInfo).toBe('function');
    expect(typeof userApi.adminUpdateUser).toBe('function');
    expect(typeof userApi.adminUpdateUserRole).toBe('function');
    expect(typeof userApi.adminResetUserPassword).toBe('function');

    // Freeze endpoints
    expect(typeof frozeApi.freezeUser).toBe('function');
    expect(typeof frozeApi.unfreezeUser).toBe('function');

    // Merchant endpoints
    expect(typeof merchantApi.listMerchants).toBe('function');
    expect(typeof merchantApi.getMerchant).toBe('function');
    expect(typeof merchantApi.adminListMerchants).toBe('function');
    expect(typeof merchantApi.adminGetMerchant).toBe('function');
    expect(typeof merchantApi.adminCreateMerchant).toBe('function');
    expect(typeof merchantApi.adminUpdateMerchant).toBe('function');
    expect(typeof merchantApi.adminDeleteMerchant).toBe('function');

    // VPS endpoints
    expect(typeof vpsApi.listVPS).toBe('function');
    expect(typeof vpsApi.getVPS).toBe('function');
    expect(typeof vpsApi.adminListVPS).toBe('function');
    expect(typeof vpsApi.adminGetVPS).toBe('function');
    expect(typeof vpsApi.adminCreateVPS).toBe('function');
    expect(typeof vpsApi.adminUpdateVPS).toBe('function');
    expect(typeof vpsApi.adminDeleteVPS).toBe('function');

    // Stock endpoints
    expect(typeof stockApi.getStock).toBe('function');

    // Settings endpoints
    expect(typeof settingsApi.getPublicSettings).toBe('function');
    expect(typeof settingsApi.adminGetSettings).toBe('function');
    expect(typeof settingsApi.adminUpdateSettings).toBe('function');

    // Dashboard endpoint
    expect(typeof dashboardApi.adminGetDashboard).toBe('function');
  });

  it('New error codes are registered correctly', () => {
    expect(BusinessCode.TOKEN_REVOKED).toBe(200017);
    expect(BusinessCode.USER_FROZEN).toBe(200005);
    expect(BusinessCode.NOT_IMPLEMENTED).toBe(900005);
    expect(BusinessCode.DEPENDENCY_UNAVAILABLE).toBe(900004);

    expect(BusinessCodeMessages[200017]).toBe('登录凭证已失效，请重新登录');
    expect(BusinessCodeMessages[200005]).toBe('账号已被冻结，请联系管理员');
    expect(BusinessCodeMessages[900005]).toBe('该功能尚未实现');
  });

  it('Router contains all target routes and excludes retired comment and monitor routes', () => {
    const routePaths: string[] = [];

    const traverse = (routes: any[], parent = '') => {
      for (const r of routes) {
        const full = r.path
          ? r.path.startsWith('/')
            ? r.path
            : `${parent}/${r.path}`.replace('//', '/')
          : parent;
        if (full) routePaths.push(full);
        if (r.children) traverse(r.children, full);
      }
    };

    traverse(routes);

    // Target routes present
    expect(routePaths).toContain('/');
    expect(routePaths).toContain('/merchants');
    expect(routePaths).toContain('/merchants/:id');
    expect(routePaths).toContain('/vps/:id');
    expect(routePaths).toContain('/login');
    expect(routePaths).toContain('/register');
    expect(routePaths).toContain('/reset-password');
    expect(routePaths).toContain('/forgot-password');
    expect(routePaths).toContain('/account');
    expect(routePaths).toContain('/admin');
    expect(routePaths).toContain('/admin/merchants');
    expect(routePaths).toContain('/admin/vps');
    expect(routePaths).toContain('/admin/vps/:id');
    expect(routePaths).toContain('/admin/users');
    expect(routePaths).toContain('/admin/settings');

    // Retired routes must NOT exist
    expect(routePaths).not.toContain('/account/comments');
    expect(routePaths).not.toContain('/admin/comments');
    expect(routePaths).not.toContain('/admin/monitors');
  });
});
