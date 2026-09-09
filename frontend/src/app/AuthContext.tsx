import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, LoginResult, RegisterRequest } from '@/types/api';
import { apiClient, AUTH_UNAUTHORIZED_EVENT } from '@/lib/http/client';
import { setAccessToken, requestTokenRefresh } from '@/lib/http/token';
import { ensureCsrfToken } from '@/lib/http/csrf';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  login: (username: string, password: string) => Promise<User>;
  register: (req: RegisterRequest) => Promise<User>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  updateUser: (user: User) => void;
  refreshProfile: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // 初始化认证状态：先拿 CSRF，再尝试静默 refresh 换取内存 Access Token，最后拿 /me
  const initAuth = useCallback(async () => {
    try {
      setLoading(true);
      await ensureCsrfToken();
      // 尝试静默刷新以恢复登录会话
      const token = await requestTokenRefresh();
      if (token) {
        const meRes = await apiClient.get<User>('/me');
        setUser(meRes.data);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
      setAccessToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    initAuth();

    // 监听 401 彻底未授权事件
    const handleUnauthorized = () => {
      setUser(null);
    };

    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => {
      window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
    };
  }, [initAuth]);

  // 登录
  const login = async (username: string, password: string): Promise<User> => {
    const res = await apiClient.post<LoginResult>('/auth/login', {
      username: username.toLowerCase().trim(),
      password,
    });
    setAccessToken(res.data.access_token);
    setUser(res.data.user);
    return res.data.user;
  };

  // 注册（注册后不自动登录）
  const register = async (req: RegisterRequest): Promise<User> => {
    const res = await apiClient.post<{ user: User }>('/auth/register', {
      username: req.username.toLowerCase().trim(),
      nickname: req.nickname.trim(),
      password: req.password,
    });
    return res.data.user;
  };

  // 退出当前设备会话
  const logout = async (): Promise<void> => {
    try {
      await apiClient.post('/auth/logout', {});
    } catch {
      // 忽略登出网络失败
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  };

  // 退出所有设备会话
  const logoutAll = async (): Promise<void> => {
    try {
      await apiClient.post('/auth/logout-all', {});
    } catch {
      // 忽略登出网络失败
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  };

  // 更新当前用户信息
  const updateUser = (newUser: User) => {
    setUser(newUser);
  };

  // 重新获取个人信息
  const refreshProfile = async (): Promise<User | null> => {
    try {
      const meRes = await apiClient.get<User>('/me');
      setUser(meRes.data);
      return meRes.data;
    } catch {
      return null;
    }
  };

  const isAdmin = Boolean(user && user.role === 'admin' && user.enabled);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAdmin,
        login,
        register,
        logout,
        logoutAll,
        updateUser,
        refreshProfile,
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
