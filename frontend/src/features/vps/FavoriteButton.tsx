import React from 'react';
import { useAuthOptional } from '@/app/AuthContext';
import { useFavoritesOptional } from '@/app/FavoritesContext';
import { Star, Loader2, RefreshCw } from 'lucide-react';
import clsx from 'clsx';

export interface FavoriteButtonProps {
  vpsId: string;
  className?: string;
  size?: 'sm' | 'md';
}

export const FavoriteButton: React.FC<FavoriteButtonProps> = ({
  vpsId,
  className,
  size = 'md',
}) => {
  const auth = useAuthOptional();
  const favorites = useFavoritesOptional();

  // 未登录、未包装在 AuthProvider/FavoritesProvider 中、认证加载中或不可用时隐藏星星且不请求收藏数据
  if (!auth || auth.status !== 'authenticated' || !favorites) {
    return null;
  }

  const {
    isFavorited,
    isPending,
    toggleFavorite,
    isLoaded,
    error,
    reloadFavorites,
  } = favorites;

  const isFav = isFavorited(vpsId);
  const pending = isPending(vpsId);

  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const padding = size === 'sm' ? 'p-1' : 'p-1.5';

  // 首次全局收藏数据尚未完成加载
  if (!isLoaded) {
    if (error) {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            reloadFavorites();
          }}
          className={clsx(
            'inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 cursor-pointer shrink-0 min-w-[32px] min-h-[32px]',
            padding,
            className
          )}
          title="收藏状态加载失败，点击重试"
          aria-label="收藏状态加载失败，点击重试"
        >
          <RefreshCw className={clsx(iconSize, 'text-red-400')} />
        </button>
      );
    }

    // 初次加载中：占位不可操作，状态为 unknown，不假装成未收藏
    return (
      <button
        type="button"
        disabled
        aria-busy="true"
        aria-label="正在加载收藏状态"
        className={clsx(
          'inline-flex items-center justify-center rounded-lg text-gray-300 opacity-60 cursor-not-allowed shrink-0 min-w-[32px] min-h-[32px]',
          padding,
          className
        )}
      >
        <Star className={clsx(iconSize, 'text-gray-300 animate-pulse')} />
      </button>
    );
  }

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    try {
      await toggleFavorite(vpsId);
    } catch {
      // 错误信息在 context 内部通过 Toast 统一呈现
    }
  };

  const label = pending
    ? '正在更新收藏状态...'
    : isFav
      ? '取消收藏'
      : '添加收藏';

  return (
    <button
      type="button"
      disabled={pending}
      aria-label={label}
      aria-pressed={isFav}
      onClick={handleClick}
      className={clsx(
        'inline-flex items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 shrink-0 cursor-pointer min-w-[32px] min-h-[32px]',
        pending && 'opacity-60 cursor-not-allowed',
        isFav
          ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-50'
          : 'text-gray-400 hover:text-amber-500 hover:bg-gray-100',
        padding,
        className
      )}
    >
      {pending ? (
        <Loader2 className={clsx(iconSize, 'animate-spin text-amber-500')} />
      ) : (
        <Star
          className={clsx(
            iconSize,
            'transition-transform active:scale-90',
            isFav ? 'fill-current text-amber-500' : 'text-gray-400 hover:text-amber-500'
          )}
        />
      )}
    </button>
  );
};
