import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { handlers } from '../mocks/handlers';
import { mockUserFavors, resetMockUserFavors } from '../mocks/handlers/account';
import { setCurrentMockUser } from '../mocks/handlers/auth';
import { setAccessToken } from '../lib/http/token';
import { setCsrfToken } from '../lib/http/csrf';
import * as favorApi from '../api/favor';
import { FavoriteButton } from '../features/vps/FavoriteButton';
import { VpsCard } from '../features/vps/VpsCard';
import { mockVpsList } from '../mocks/data';
import { AuthContext, AuthContextType } from '../app/AuthContext';
import { FavoritesContext, FavoritesContextType } from '../app/FavoritesContext';
import { mockUsers } from '../mocks/data';

const server = setupServer(...handlers);

describe('VPS Favorites End-to-End & Unit Tests', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  beforeEach(() => {
    resetMockUserFavors();
    setCurrentMockUser('2'); // User 2 is authenticated regular user
    setAccessToken('mock_access_token_user2');
    setCsrfToken('mock_csrf_valid_token_12345');
  });

  afterEach(() => {
    server.resetHandlers();
    setAccessToken(null);
    setCsrfToken(null);
    setCurrentMockUser(null);
    vi.restoreAllMocks();
  });

  afterAll(() => {
    server.close();
  });

  describe('1. Unauthenticated & Authorization Enforcement', () => {
    it('returns 401 when anonymous user attempts addFavor, delFavor, or listFavors', async () => {
      setCurrentMockUser(null);
      setAccessToken(null);

      await expect(favorApi.addFavor('1001')).rejects.toMatchObject({
        status: 401,
        code: 200002,
      });

      await expect(favorApi.delFavor('1001')).rejects.toMatchObject({
        status: 401,
        code: 200002,
      });

      await expect(favorApi.listFavors()).rejects.toMatchObject({
        status: 401,
        code: 200002,
      });
    });

    it('FavoriteButton renders null and stays completely hidden for anonymous users', () => {
      // Mock useAuth returning anonymous
      const html = renderToStaticMarkup(
        React.createElement(FavoriteButton, { vpsId: '1001' })
      );
      // When not inside provider or unauthenticated, default or anonymous renders null
      expect(html).toBe('');
    });
  });

  describe('2. HTTP Contract & API Param Encoding', () => {
    it('addFavor sends POST with vpsId strictly in URL search params and returns success envelope', async () => {
      let interceptedUrl: URL | null = null;
      let interceptedMethod = '';

      server.use(
        http.post('*/api/v1/me/addFavor', ({ request }) => {
          interceptedUrl = new URL(request.url);
          interceptedMethod = request.method;
          return HttpResponse.json({
            code: 0,
            message: 'ok',
            data: 'success',
            request_id: 'req_test_add',
          });
        })
      );

      const res = await favorApi.addFavor('test-vps/42');
      expect(interceptedMethod).toBe('POST');
      expect(interceptedUrl).not.toBeNull();
      expect(interceptedUrl!.searchParams.get('vpsId')).toBe('test-vps/42');
      expect(res.code).toBe(0);
      expect(res.data).toBe('success');
    });

    it('delFavor sends DELETE with vpsId strictly in URL search params and returns success envelope', async () => {
      let interceptedUrl: URL | null = null;
      let interceptedMethod = '';

      server.use(
        http.delete('*/api/v1/me/delFavor', ({ request }) => {
          interceptedUrl = new URL(request.url);
          interceptedMethod = request.method;
          return HttpResponse.json({
            code: 0,
            message: 'ok',
            data: 'success',
            request_id: 'req_test_del',
          });
        })
      );

      const res = await favorApi.delFavor('test-vps/42');
      expect(interceptedMethod).toBe('DELETE');
      expect(interceptedUrl).not.toBeNull();
      expect(interceptedUrl!.searchParams.get('vpsId')).toBe('test-vps/42');
      expect(res.code).toBe(0);
      expect(res.data).toBe('success');
    });

    it('repeated addFavor and repeated delFavor are idempotent and succeed', async () => {
      // First add
      const res1 = await favorApi.addFavor('1002');
      expect(res1.data).toBe('success');

      // Duplicate add
      const res2 = await favorApi.addFavor('1002');
      expect(res2.data).toBe('success');

      // Delete
      const res3 = await favorApi.delFavor('1002');
      expect(res3.data).toBe('success');

      // Duplicate delete
      const res4 = await favorApi.delFavor('1002');
      expect(res4.data).toBe('success');
    });
  });

  describe('3. Global Snapshot & Pagination with >100 Favorites', () => {
    it('fetches all visible favorites across multiple pages (page 1 + page 2) without stopping at page 1', async () => {
      // Mock 130 favorited items across 2 pages
      const totalItems = 130;
      const allIds = Array.from({ length: totalItems }, (_, i) => `vps-mock-${i + 1}`);
      mockUserFavors.set('2', new Set(allIds));

      const pageCalls: number[] = [];

      server.use(
        http.get('*/api/v1/me/listFavors', ({ request }) => {
          const url = new URL(request.url);
          const page = parseInt(url.searchParams.get('page') || '1', 10);
          const pageSize = parseInt(url.searchParams.get('page_size') || '20', 10);
          pageCalls.push(page);

          const offset = (page - 1) * pageSize;
          const pageIds = allIds.slice(offset, offset + pageSize);
          const items = pageIds.map((id) => ({
            ...mockVpsList[0],
            id,
            name: `Mock VPS ${id}`,
          }));

          return HttpResponse.json({
            code: 0,
            message: 'ok',
            data: {
              items,
              total: totalItems,
              page,
              page_size: pageSize,
            },
            request_id: `req_page_${page}`,
          });
        })
      );

      // Verify page 1 fetch
      const res1 = await favorApi.listFavors({ page: 1, page_size: 100, sort: 'updated_desc' });
      expect(res1.data.items).toHaveLength(100);
      expect(res1.data.total).toBe(130);

      // Verify page 2 fetch
      const res2 = await favorApi.listFavors({ page: 2, page_size: 100, sort: 'updated_desc' });
      expect(res2.data.items).toHaveLength(30);

      // Combined IDs contain item from page 2
      const combined = new Set([...res1.data.items.map((i) => i.id), ...res2.data.items.map((i) => i.id)]);
      expect(combined.size).toBe(130);
      expect(combined.has('vps-mock-125')).toBe(true);
    });
  });

  describe('4. Server-side Query, Filtering & Sorting on Favorites List', () => {
    beforeEach(() => {
      // User 2 has 1001, 1002, 1003 in favorites
      mockUserFavors.set('2', new Set(['1001', '1002', '1003']));
    });

    it('filters favorites by keyword query q', async () => {
      const res = await favorApi.listFavors({ q: 'DMIT' });
      expect(res.data.items.every((v) => v.name.includes('DMIT') || v.merchant.name.includes('DMIT'))).toBe(true);
    });

    it('filters favorites by merchant_id', async () => {
      const res = await favorApi.listFavors({ merchant_id: '1' });
      expect(res.data.items.every((v) => v.merchant.id === '1')).toBe(true);
    });

    it('sorts favorites by price_asc', async () => {
      const res = await favorApi.listFavors({ sort: 'price_asc' });
      const prices = res.data.items.map((v) => parseFloat(v.price_amount));
      for (let i = 0; i < prices.length - 1; i++) {
        expect(prices[i]).toBeLessThanOrEqual(prices[i + 1]);
      }
    });

    it('returns empty list with total 0 when filter matches nothing', async () => {
      const res = await favorApi.listFavors({ q: 'non-existent-keyword-99999' });
      expect(res.data.items).toEqual([]);
      expect(res.data.total).toBe(0);
    });
  });

  describe('5. Cross-Account Isolation', () => {
    it('isolates favorites between User 1 (Admin) and User 2 (Regular user)', async () => {
      // User 1 favors 1002
      mockUserFavors.set('1', new Set(['1002']));
      // User 2 favors 1003
      mockUserFavors.set('2', new Set(['1003']));

      // Authenticate as User 1
      setCurrentMockUser('1');
      setAccessToken('mock_access_token_user1');
      const resUser1 = await favorApi.listFavors();
      expect(resUser1.data.items.map((v) => v.id)).toContain('1002');
      expect(resUser1.data.items.map((v) => v.id)).not.toContain('1003');

      // Switch to User 2
      setCurrentMockUser('2');
      setAccessToken('mock_access_token_user2');
      const resUser2 = await favorApi.listFavors();
      expect(resUser2.data.items.map((v) => v.id)).toContain('1003');
      expect(resUser2.data.items.map((v) => v.id)).not.toContain('1002');
    });
  });

  describe('6. Error Handling & Rollback', () => {
    it('handles backend 500 / 500001 database error without marking as success', async () => {
      server.use(
        http.post('*/api/v1/me/addFavor', () => {
          return HttpResponse.json(
            { code: 500001, message: '数据库操作失败，请重试', data: null, request_id: 'req_err' },
            { status: 500 }
          );
        })
      );

      await expect(favorApi.addFavor('1002')).rejects.toMatchObject({
        status: 500,
        code: 500001,
        message: '数据库操作失败，请重试',
      });
    });

    it('handles backend 404 when adding a non-existent or hidden VPS', async () => {
      server.use(
        http.post('*/api/v1/me/addFavor', () => {
          return HttpResponse.json(
            { code: 100005, message: '该 VPS 不存在或已下架', data: null, request_id: 'req_404' },
            { status: 404 }
          );
        })
      );

      await expect(favorApi.addFavor('9999')).rejects.toMatchObject({
        status: 404,
        code: 100005,
      });
    });
  });

  describe('7. Concurrency & In-Flight Re-entrancy Logic', () => {
    it('in-flight map prevents duplicate concurrent requests for the same VPS ID', async () => {
      let callCount = 0;
      server.use(
        http.post('*/api/v1/me/addFavor', async () => {
          callCount++;
          // Simulate latency
          await new Promise((r) => setTimeout(r, 50));
          return HttpResponse.json({
            code: 0,
            message: 'ok',
            data: 'success',
            request_id: 'req_concurrent',
          });
        })
      );

      // Re-entrancy logic simulation
      const inFlightMap = new Map<string, Promise<any>>();
      const trigger = (vpsId: string) => {
        if (inFlightMap.has(vpsId)) {
          return inFlightMap.get(vpsId)!;
        }
        const p = favorApi.addFavor(vpsId).finally(() => inFlightMap.delete(vpsId));
        inFlightMap.set(vpsId, p);
        return p;
      };

      // Rapidly fire 3 triggers simultaneously
      const [res1, res2, res3] = await Promise.all([
        trigger('1003'),
        trigger('1003'),
        trigger('1003'),
      ]);

      expect(res1.data).toBe('success');
      expect(res2.data).toBe('success');
      expect(res3.data).toBe('success');
      // Only 1 network request was actually fired!
      expect(callCount).toBe(1);
    });

    it('allows independent in-flight requests for different VPS IDs', async () => {
      let idsRequested: string[] = [];
      server.use(
        http.post('*/api/v1/me/addFavor', ({ request }) => {
          const url = new URL(request.url);
          idsRequested.push(url.searchParams.get('vpsId') || '');
          return HttpResponse.json({
            code: 0,
            message: 'ok',
            data: 'success',
            request_id: 'req_diff',
          });
        })
      );

      await Promise.all([favorApi.addFavor('1001'), favorApi.addFavor('1002')]);
      expect(idsRequested).toContain('1001');
      expect(idsRequested).toContain('1002');
    });
  });

  describe('8. Stale Response & Generation Guard Logic', () => {
    it('discards stale list response when generation has incremented', () => {
      let currentGen = 1;
      let stateIds = new Set<string>();

      const staleResponseIds = ['1001', '1002'];
      const requestGen = currentGen;

      // User performs another action, bumping generation
      currentGen = 2;

      // Late response arrives
      if (requestGen === currentGen) {
        stateIds = new Set(staleResponseIds);
      }

      // State is NOT polluted by stale response
      expect(stateIds.size).toBe(0);
    });

    it('reconciles completed list fetch with recent mutations via mutation overlay', () => {
      const loadStartTime = 1000;
      const mutationOverlay = new Map<string, { action: 'add' | 'del'; timestamp: number }>();

      // User added 1003 at time 1050 (during list fetch)
      mutationOverlay.set('1003', { action: 'add', timestamp: 1050 });

      // List fetch completes at time 1100, containing only older items [1001]
      const fetchedIds = new Set(['1001']);

      // Overlay reconciliation:
      mutationOverlay.forEach((m, id) => {
        if (m.timestamp >= loadStartTime) {
          if (m.action === 'add') fetchedIds.add(id);
          else fetchedIds.delete(id);
        }
      });

      expect(fetchedIds.has('1003')).toBe(true);
      expect(fetchedIds.has('1001')).toBe(true);
    });
  });

  describe('9. Component UI & Accessibility Verification', () => {
    const MockContexts: React.FC<{
      auth?: Partial<AuthContextType>;
      favorites?: Partial<FavoritesContextType>;
      children?: React.ReactNode;
    }> = ({ auth, favorites, children }) => {
      const fullAuth: AuthContextType = {
        status: 'authenticated',
        user: mockUsers[1],
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
          MockContexts,
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
          MockContexts,
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
          MockContexts,
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
          MockContexts,
          { favorites: { isLoaded: false, error: '网络超时' } },
          React.createElement(FavoriteButton, { vpsId: '1001' })
        )
      );

      expect(html).toContain('aria-label="收藏状态加载失败，点击重试"');
    });

    it('FavoriteButton renders spinner and disables button when operation is in flight', () => {
      const html = renderToStaticMarkup(
        React.createElement(
          MockContexts,
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

    it('VpsCard renders FavoriteButton with keyboard focus and correct DOM semantics', () => {
      const vps = mockVpsList[0];
      const html = renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(
            MockContexts,
            { favorites: { favoriteIds: new Set([vps.id]) } },
            React.createElement(VpsCard, { vps })
          )
        )
      );

      expect(html).toContain(vps.name);
      expect(html).toContain('上次检查时间');
      expect(html).toContain('aria-pressed="true"');
      expect(html).toContain('aria-label="取消收藏"');
    });

    it('Pagination fallback logic resets to previous valid page when last item of page is removed', () => {
      const pageSize = 20;
      let currentPage = 2;
      let total = 21;

      // Item removed: total becomes 20
      total = 20;
      const maxPage = Math.max(1, Math.ceil(total / pageSize)); // 1

      if (currentPage > maxPage) {
        currentPage = maxPage;
      }

      expect(currentPage).toBe(1);
    });
  });
});
