import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BasketItem, BasketQuote, Catalog } from '../src/api';
import { useCatalog, useQuote } from '../src/useStore';
import { catalog, createApi, deferred, quote } from './fixtures';

describe('catalog lifecycle', () => {
  it('loads the catalog and cancels work on unmount', async () => {
    const api = createApi();
    const { result, unmount } = renderHook(() => useCatalog(api));
    expect(result.current.state.status).toBe('loading');
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', data: catalog }));
    const signal = vi.mocked(api.catalog).mock.calls[0]![0];
    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
  });

  it('recovers from a failed catalog request', async () => {
    const api = createApi();
    vi.mocked(api.catalog).mockRejectedValueOnce(new Error('Offline'));
    const { result } = renderHook(() => useCatalog(api));
    await waitFor(() => expect(result.current.state.status).toBe('error'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', data: catalog }));
    expect(api.catalog).toHaveBeenCalledTimes(2);
  });

  it.each(['resolve', 'reject'] as const)(
    'ignores a stale catalog request that later %ss',
    async (outcome) => {
      const stale = deferred<Catalog>();
      const latest = deferred<Catalog>();
      const api = createApi();
      vi.mocked(api.catalog).mockReturnValueOnce(stale.promise).mockReturnValueOnce(latest.promise);
      const { result } = renderHook(() => useCatalog(api));
      act(() => result.current.retry());
      await act(async () => {
        latest.resolve(catalog);
      });
      await act(async () => {
        if (outcome === 'resolve') stale.resolve({ ...catalog, products: [] });
        else stale.reject(new Error('Stale request'));
      });
      expect(result.current.state).toEqual({ status: 'ready', data: catalog });
      expect(vi.mocked(api.catalog).mock.calls[0]![0].aborted).toBe(true);
    },
  );
});

describe('quote lifecycle', () => {
  it('does not request a quote for an empty basket', () => {
    const api = createApi();
    renderHook(() => useQuote(api, []));
    expect(api.quote).not.toHaveBeenCalled();
  });

  it('requests a new quote when quantities change', async () => {
    const api = createApi();
    const { result, rerender } = renderHook(({ items }) => useQuote(api, items), {
      initialProps: { items: [{ code: 'R01', quantity: 1 }] },
    });
    expect(result.current.state.status).toBe('loading');
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', data: quote }));
    rerender({ items: [{ code: 'R01', quantity: 2 }] });
    await waitFor(() =>
      expect(api.quote).toHaveBeenLastCalledWith(
        [{ code: 'R01', quantity: 2 }],
        expect.any(AbortSignal),
      ),
    );
    expect(vi.mocked(api.quote).mock.calls[0]![1].aborted).toBe(true);
  });

  it('retains the basket and retries a failed quote', async () => {
    const api = createApi();
    vi.mocked(api.quote).mockRejectedValueOnce(new Error('Offline'));
    const items = [{ code: 'B01', quantity: 1 }];
    const { result } = renderHook(() => useQuote(api, items));
    await waitFor(() => expect(result.current.state.status).toBe('error'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', data: quote }));
    expect(api.quote).toHaveBeenCalledTimes(2);
    expect(api.quote).toHaveBeenLastCalledWith(items, expect.any(AbortSignal));
  });

  it.each(['resolve', 'reject'] as const)(
    'ignores a stale quote that later %ss',
    async (outcome) => {
      const stale = deferred<BasketQuote>();
      const latest = deferred<BasketQuote>();
      const api = createApi();
      vi.mocked(api.quote).mockReturnValueOnce(stale.promise).mockReturnValueOnce(latest.promise);
      const { result, rerender } = renderHook(({ items }) => useQuote(api, items), {
        initialProps: { items: [{ code: 'R01', quantity: 1 }] },
      });
      rerender({ items: [{ code: 'R01', quantity: 2 }] });
      await act(async () => {
        latest.resolve(quote);
      });
      await act(async () => {
        if (outcome === 'resolve') stale.resolve({ ...quote, totalCents: 1 });
        else stale.reject(new Error('Stale request'));
      });
      expect(result.current.state).toEqual({ status: 'ready', data: quote });
    },
  );

  it('cancels an in-flight quote when the basket is cleared', async () => {
    const pending = deferred<BasketQuote>();
    const api = createApi();
    vi.mocked(api.quote).mockReturnValue(pending.promise);
    const { rerender } = renderHook(({ items }: { items: BasketItem[] }) => useQuote(api, items), {
      initialProps: { items: [{ code: 'R01', quantity: 1 }] },
    });
    rerender({ items: [] });
    expect(vi.mocked(api.quote).mock.calls[0]![1].aborted).toBe(true);
    await act(async () => {
      pending.resolve(quote);
    });
    expect(api.quote).toHaveBeenCalledTimes(1);
  });
});
