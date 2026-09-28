import { describe, it, expect, afterEach, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as favorApi from '../api/favor';
import { FavoriteButton } from '../features/vps/FavoriteButton';
import { AuthContext, AuthContextType } from '../app/AuthContext';
import { FavoritesContext, FavoritesContextType } from '../app/FavoritesContext';

// Test-local transport responses exercise the real API client without a demo backend.
afterEach(() => vi.unstubAllGlobals());

describe('Favorites HTTP contract', () => {
  it('encodes the ID in query parameters for add and delete', async () => {
    const transport = vi.fn(async () => Response.json({ code: 0, message: 'ok', data: 'success' }));
    vi.stubGlobal('fetch', transport);
    await expect(favorApi.addFavor('vps/42 &')).resolves.toMatchObject({ data: 'success' });
    expect(transport).toHaveBeenLastCalledWith('http://localhost/api/v1/me/addFavor?vpsId=vps%2F42%20%26', expect.objectContaining({ method: 'POST' }));
    await favorApi.delFavor('vps/42 &');
    expect(transport).toHaveBeenLastCalledWith('http://localhost/api/v1/me/delFavor?vpsId=vps%2F42%20%26', expect.objectContaining({ method: 'DELETE' }));
  });

  it('passes filters and pagination to the list endpoint', async () => {
    const transport = vi.fn(async () => Response.json({ code: 0, data: { items: [], total: 0, page: 2, page_size: 100 } }));
    vi.stubGlobal('fetch', transport);
    const result = await favorApi.listFavors({ page: 2, page_size: 100, merchant_id: '7', q: 'A & B', sort: 'price_asc' });
    const [url] = transport.mock.calls[0] as unknown as [string];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/api/v1/me/listFavors');
    expect(Object.fromEntries(parsed.searchParams)).toEqual({ page: '2', page_size: '100', merchant_id: '7', q: 'A & B', sort: 'price_asc' });
    expect(result.data.items).toEqual([]);
  });

  it.each([[500, 500001], [404, 100005]])('propagates backend failure %s/%s', async (status, code) => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ code, message: 'failed', data: null }, { status })));
    await expect(favorApi.addFavor('42')).rejects.toMatchObject({ status, code });
  });

  it('hides the favorite button when authentication is unavailable', () => {
    expect(renderToStaticMarkup(React.createElement(FavoriteButton, { vpsId: '42' }))).toBe('');
  });
});

  describe('Favorite components', () => {
    const TestContexts: React.FC<{
      auth?: Partial<AuthContextType>;
      favorites?: Partial<FavoritesContextType>;
      children?: React.ReactNode;
    }> = ({ auth, favorites, children }) => {
      const fullAuth: AuthContextType = {
        status: 'authenticated',
        user: { id: '2', username: 'reader', nickname: 'Reader', role: 'user', mail: null, mail_verified: false, mail_verified_at: null, mail_required: false, created_at: '', updated_at: '' },
        loading: false,
        isAdmin: false,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
        updateUser: vi.fn(),
        reloadProfile: vi.fn(),
        frozenAlert: null,
        clearFrozenAlert: vi.fn(),
        ...auth,
      };

      const fullFavorites: FavoritesContextType = {
        favoriteIds: new Set(['1001']),
        isLoading: false,
        isLoaded: true,
        error: null,
        inFlightIds: new Set(),
        isFavorited: (id: string) => (favorites?.favoriteIds || new Set(['1001'])).has(id),
        isPending: (id: string) => (favorites?.inFlightIds || new Set()).has(id),
        toggleFavorite: vi.fn(),
        addFavorite: vi.fn(),
        removeFavorite: vi.fn(),
        reloadFavorites: vi.fn(),
        ...favorites,
      };

      return (
        <AuthContext.Provider value={fullAuth}>
          <FavoritesContext.Provider value={fullFavorites}>
            {children}
          </FavoritesContext.Provider>
        </AuthContext.Provider>
      );
    };

    it('FavoriteButton renders filled star when item is favorited', () => {
      const html = renderToStaticMarkup(
        React.createElement(
          TestContexts,
          { favorites: { favoriteIds: new Set(['1001']) } },
          React.createElement(FavoriteButton, { vpsId: '1001' })
        )
      );

      expect(html).toContain('aria-pressed="true"');
      expect(html).toContain('aria-label="取消收藏"');
      expect(html).toContain('fill-current');
      expect(html).toContain('text-amber-500');
    });

    it('FavoriteButton renders outline star when item is not favorited', () => {
      const html = renderToStaticMarkup(
        React.createElement(
          TestContexts,
          { favorites: { favoriteIds: new Set(['1001']) } },
          React.createElement(FavoriteButton, { vpsId: '1002' })
        )
      );

      expect(html).toContain('aria-pressed="false"');
      expect(html).toContain('aria-label="添加收藏"');
      expect(html).not.toContain('fill-current');
      expect(html).toContain('text-gray-400');
    });

    it('FavoriteButton renders disabled placeholder with aria-busy while initial load is in progress', () => {
      const html = renderToStaticMarkup(
        React.createElement(
          TestContexts,
          { favorites: { isLoaded: false, isLoading: true, isFavorited: () => undefined } },
          React.createElement(FavoriteButton, { vpsId: '1001' })
        )
      );

      expect(html).toContain('disabled=""');
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('aria-label="正在加载收藏状态"');
      // Must not pretend unknown is un-favorited or favorited
      expect(html).not.toContain('添加收藏');
      expect(html).not.toContain('取消收藏');
    });

    it('FavoriteButton renders retry button when initial load failed', () => {
      const html = renderToStaticMarkup(
        React.createElement(
          TestContexts,
          { favorites: { isLoaded: false, error: '网络超时' } },
          React.createElement(FavoriteButton, { vpsId: '1001' })
        )
      );

      expect(html).toContain('aria-label="收藏状态加载失败，点击重试"');
    });

    it('FavoriteButton renders spinner and disables button when operation is in flight', () => {
      const html = renderToStaticMarkup(
        React.createElement(
          TestContexts,
          {
            favorites: {
              favoriteIds: new Set(['1001']),
              inFlightIds: new Set(['1001']),
              isPending: (id: string) => id === '1001',
            },
          },
          React.createElement(FavoriteButton, { vpsId: '1001' })
        )
      );

      expect(html).toContain('disabled=""');
      expect(html).toContain('aria-label="正在更新收藏状态..."');
      expect(html).toContain('animate-spin');
    });

});
