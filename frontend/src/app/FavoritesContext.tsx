import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { useAuth } from './AuthContext';
import { useToast } from '@/components/ui/Toast';
import * as favorApi from '@/api/favor';
import { getErrorMessage } from '@/lib/http/errors';

export interface FavoritesContextType {
  favoriteIds: Set<string>;
  isLoading: boolean;
  isLoaded: boolean;
  error: string | null;
  inFlightIds: Set<string>;
  isFavorited: (vpsId: string) => boolean | undefined;
  isPending: (vpsId: string) => boolean;
  toggleFavorite: (vpsId: string) => Promise<boolean>;
  addFavorite: (vpsId: string) => Promise<void>;
  removeFavorite: (vpsId: string) => Promise<void>;
  reloadFavorites: () => Promise<void>;
}

export const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

export const FavoritesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, status } = useAuth();
  const toast = useToast();

  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [inFlightIds, setInFlightIds] = useState<Set<string>>(new Set());

  // 代次与用户跟踪，防止跨用户或迟到响应污染
  const generationRef = useRef<number>(0);
  const currentUserRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const inFlightMapRef = useRef<Map<string, Promise<void>>>(new Map());
  const mutationOverlayRef = useRef<Map<string, { action: 'add' | 'del'; timestamp: number }>>(new Map());

  const userId = status === 'authenticated' && user ? user.id : null;
  currentUserRef.current = userId;

  // 分页获取当前用户的全部可见收藏，建立全局 ID Set
  const loadAllFavorites = useCallback(async (targetUserId: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const currentGen = ++generationRef.current;
    const loadStartTime = Date.now();

    setIsLoading(true);
    setError(null);

    try {
      const pageSize = 100;
      let currentPage = 1;
      const collectedIds: string[] = [];

      // 读取第 1 页
      const firstRes = await favorApi.listFavors({
        page: currentPage,
        page_size: pageSize,
        sort: 'updated_desc',
      });

      if (
        abortController.signal.aborted ||
        currentGen !== generationRef.current ||
        currentUserRef.current !== targetUserId
      ) {
        return;
      }

      if (firstRes.data && Array.isArray(firstRes.data.items)) {
        for (const item of firstRes.data.items) {
          collectedIds.push(item.id);
        }
      }

      const total = firstRes.data?.total || 0;
      const totalPages = Math.ceil(total / pageSize);

      // 读取后续页
      while (currentPage < totalPages && currentPage < 100) {
        currentPage++;
        const nextRes = await favorApi.listFavors({
          page: currentPage,
          page_size: pageSize,
          sort: 'updated_desc',
        });

        if (
          abortController.signal.aborted ||
          currentGen !== generationRef.current ||
          currentUserRef.current !== targetUserId
        ) {
          return;
        }

        if (!nextRes.data || !Array.isArray(nextRes.data.items) || nextRes.data.items.length === 0) {
          break;
        }

        for (const item of nextRes.data.items) {
          collectedIds.push(item.id);
        }
      }

      if (
        abortController.signal.aborted ||
        currentGen !== generationRef.current ||
        currentUserRef.current !== targetUserId
      ) {
        return;
      }

      const finalSet = new Set(collectedIds);

      // 合并加载期间由用户直接触发的写操作，防止旧快照覆盖更新的操作
      mutationOverlayRef.current.forEach((mutation, vId) => {
        if (mutation.timestamp >= loadStartTime) {
          if (mutation.action === 'add') {
            finalSet.add(vId);
          } else {
            finalSet.delete(vId);
          }
        }
      });

      setFavoriteIds(finalSet);
      setIsLoaded(true);
      setError(null);
    } catch (err: unknown) {
      if (
        abortController.signal.aborted ||
        currentGen !== generationRef.current ||
        currentUserRef.current !== targetUserId
      ) {
        return;
      }
      const errMsg = getErrorMessage(err);
      setError(errMsg);
      setIsLoaded(false);
    } finally {
      if (
        !abortController.signal.aborted &&
        currentGen === generationRef.current &&
        currentUserRef.current === targetUserId
      ) {
        setIsLoading(false);
      }
    }
  }, []);

  // 监听登录状态与用户 ID 变化
  useEffect(() => {
    if (status !== 'authenticated' || !userId) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      generationRef.current++;
      setFavoriteIds(new Set());
      setIsLoading(false);
      setIsLoaded(false);
      setError(null);
      setInFlightIds(new Set());
      inFlightMapRef.current.clear();
      mutationOverlayRef.current.clear();
      return;
    }

    loadAllFavorites(userId);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [status, userId, loadAllFavorites]);

  const reloadFavorites = useCallback(async () => {
    if (userId) {
      await loadAllFavorites(userId);
    }
  }, [userId, loadAllFavorites]);

  const addFavorite = useCallback(
    async (vpsId: string): Promise<void> => {
      const currentTargetUser = currentUserRef.current;
      if (!currentTargetUser) {
        throw new Error('用户未登录');
      }

      const existingPromise = inFlightMapRef.current.get(vpsId);
      if (existingPromise) {
        return existingPromise;
      }

      const promise = (async () => {
        try {
          await favorApi.addFavor(vpsId);

          if (currentUserRef.current !== currentTargetUser) {
            return;
          }

          mutationOverlayRef.current.set(vpsId, {
            action: 'add',
            timestamp: Date.now(),
          });

          setFavoriteIds((prev) => {
            const next = new Set(prev);
            next.add(vpsId);
            return next;
          });

          toast.success('已添加至收藏');
        } catch (err: unknown) {
          if (currentUserRef.current === currentTargetUser) {
            toast.error(getErrorMessage(err));
          }
          throw err;
        } finally {
          inFlightMapRef.current.delete(vpsId);
          setInFlightIds((prev) => {
            const next = new Set(prev);
            next.delete(vpsId);
            return next;
          });
        }
      })();

      inFlightMapRef.current.set(vpsId, promise);
      setInFlightIds((prev) => new Set(prev).add(vpsId));

      return promise;
    },
    [toast]
  );

  const removeFavorite = useCallback(
    async (vpsId: string): Promise<void> => {
      const currentTargetUser = currentUserRef.current;
      if (!currentTargetUser) {
        throw new Error('用户未登录');
      }

      const existingPromise = inFlightMapRef.current.get(vpsId);
      if (existingPromise) {
        return existingPromise;
      }

      const promise = (async () => {
        try {
          await favorApi.delFavor(vpsId);

          if (currentUserRef.current !== currentTargetUser) {
            return;
          }

          mutationOverlayRef.current.set(vpsId, {
            action: 'del',
            timestamp: Date.now(),
          });

          setFavoriteIds((prev) => {
            const next = new Set(prev);
            next.delete(vpsId);
            return next;
          });

          toast.success('已取消收藏');
        } catch (err: unknown) {
          if (currentUserRef.current === currentTargetUser) {
            toast.error(getErrorMessage(err));
          }
          throw err;
        } finally {
          inFlightMapRef.current.delete(vpsId);
          setInFlightIds((prev) => {
            const next = new Set(prev);
            next.delete(vpsId);
            return next;
          });
        }
      })();

      inFlightMapRef.current.set(vpsId, promise);
      setInFlightIds((prev) => new Set(prev).add(vpsId));

      return promise;
    },
    [toast]
  );

  const toggleFavorite = useCallback(
    async (vpsId: string): Promise<boolean> => {
      if (!isLoaded) {
        return false;
      }
      const isCurrentlyFav = favoriteIds.has(vpsId);
      if (isCurrentlyFav) {
        await removeFavorite(vpsId);
        return false;
      } else {
        await addFavorite(vpsId);
        return true;
      }
    },
    [isLoaded, favoriteIds, removeFavorite, addFavorite]
  );

  const isFavorited = useCallback(
    (vpsId: string): boolean | undefined => {
      if (!isLoaded) return undefined;
      return favoriteIds.has(vpsId);
    },
    [isLoaded, favoriteIds]
  );

  const isPending = useCallback(
    (vpsId: string): boolean => {
      return inFlightIds.has(vpsId);
    },
    [inFlightIds]
  );

  return (
    <FavoritesContext.Provider
      value={{
        favoriteIds,
        isLoading,
        isLoaded,
        error,
        inFlightIds,
        isFavorited,
        isPending,
        toggleFavorite,
        addFavorite,
        removeFavorite,
        reloadFavorites,
      }}
    >
      {children}
    </FavoritesContext.Provider>
  );
};

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) {
    throw new Error('useFavorites must be used within FavoritesProvider');
  }
  return ctx;
}

export function useFavoritesOptional() {
  return useContext(FavoritesContext);
}
