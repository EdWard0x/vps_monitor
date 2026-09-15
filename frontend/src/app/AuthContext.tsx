import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AccountUser, RegisterInput, LoginInput } from '@/types/auth';
import {
  AUTH_UNAUTHORIZED_EVENT,
  AUTH_FROZEN_EVENT,
  AUTH_REVOKED_EVENT,
} from '@/lib/http/client';
import { setAccessToken, requestTokenRefresh } from '@/lib/http/token';
import { ensureCsrfToken } from '@/lib/http/csrf';
import { isAppError } from '@/lib/http/errors';
import { BusinessCode } from '@/types/error';
import * as authApi from '@/api/auth';
import * as userApi from '@/api/user';

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated' | 'unavailable';

interface AuthContextType {
  status: AuthStatus;
  user: AccountUser | null;
  loading: boolean;
  isAdmin: boolean;
  login: (input: LoginInput) => Promise<AccountUser>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: AccountUser) => void;
  reloadProfile: () => Promise<AccountUser | null>;
  frozenAlert: string | null;
  clearFrozenAlert: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AccountUser | null>(null);
  const [frozenAlert, setFrozenAlert] = useState<string | null>(null);

  // 初始化认证状态：获取 CSRF，尝试静默 refresh 恢复 AT，再拉取 /me/info
  const initAuth = useCallback(async () => {
    try {
      setStatus('loading');
      await ensureCsrfToken();
      const token = await requestTokenRefresh();
      if (token) {
        try {
          const meRes = await userApi.getMe();
          setUser(meRes.data);
          setStatus('authenticated');
        } catch (err) {
          if (isAppError(err) && (err.code === BusinessCode.NOT_IMPLEMENTED || err.status === 501)) {
            setStatus('unavailable');
          } else {
            setUser(null);
            setStatus('anonymous');
          }
        }
      } else {
        setUser(null);
        setStatus('anonymous');
      }
    } catch (err) {
      if (isAppError(err) && (err.code === BusinessCode.NOT_IMPLEMENTED || err.status === 501)) {
        setStatus('unavailable');
      } else {
        setUser(null);
        setStatus('anonymous');
      }
      setAccessToken(null);
    }
  }, []);

  useEffect(() => {
    initAuth();

    const handleUnauthorized = () => {
      setUser(null);
      setStatus('anonymous');
    };

    const handleFrozen = () => {
      setUser(null);
      setStatus('anonymous');
      setFrozenAlert('账号已被冻结，请联系管理员');
    };

    const handleRevoked = () => {
      setUser(null);
      setStatus('anonymous');
      setFrozenAlert('登录凭证已失效，请重新登录');
    };

    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
    window.addEventListener(AUTH_FROZEN_EVENT, handleFrozen);
    window.addEventListener(AUTH_REVOKED_EVENT, handleRevoked);

    return () => {
      window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
      window.removeEventListener(AUTH_FROZEN_EVENT, handleFrozen);
      window.removeEventListener(AUTH_REVOKED_EVENT, handleRevoked);
    };
  }, [initAuth]);

  // 登录：调用 API，保存 AT 到内存，设置用户与 authenticated 状态
  const login = async (input: LoginInput): Promise<AccountUser> => {
    const res = await authApi.login({
      username: input.username.toLowerCase().trim(),
      password: input.password,
    });
    setAccessToken(res.data.access_token);
    setUser(res.data.user);
    setStatus('authenticated');
    setFrozenAlert(null);
    return res.data.user;
  };

  // 注册：调用 API，注册成功后不自动登录
  const register = async (input: RegisterInput): Promise<void> => {
    await authApi.register({
      username: input.username.toLowerCase().trim(),
      nickname: input.nickname.trim(),
      password: input.password,
    });
  };

  // 退出：清理本地 AT 与状态，调用 API 清除 RT Cookie
  const logout = async (): Promise<void> => {
    try {
      await authApi.logout();
    } catch {
      // 忽略登出网络失败
    } finally {
      setAccessToken(null);
      setUser(null);
      setStatus('anonymous');
    }
  };

  const updateUser = (updatedUser: AccountUser) => {
    setUser(updatedUser);
  };

  const reloadProfile = async (): Promise<AccountUser | null> => {
    try {
      const res = await userApi.getMe();
      setUser(res.data);
      return res.data;
    } catch {
      return null;
    }
  };

  const clearFrozenAlert = () => setFrozenAlert(null);

  const isAdmin = user?.role === 'admin';
  const loading = status === 'loading';

  return (
    <AuthContext.Provider
      value={{
        status,
        user,
        loading,
        isAdmin,
        login,
        register,
        logout,
        updateUser,
        reloadProfile,
        frozenAlert,
        clearFrozenAlert,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
