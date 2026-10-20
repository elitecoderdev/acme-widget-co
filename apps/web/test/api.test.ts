import { afterEach, describe, expect, it, vi } from 'vitest';
import { storeApi } from '../src/api';
import { catalog, quote } from './fixtures';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('HTTP store adapter', () => {
  it('gets the catalog with an abort signal', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(catalog), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    await expect(storeApi.catalog(controller.signal)).resolves.toEqual(catalog);
    expect(fetchMock).toHaveBeenCalledWith('/api/catalog', { signal: expect.any(AbortSignal) });
    const requestSignal = fetchMock.mock.calls[0]![1].signal as AbortSignal;
    expect(requestSignal.aborted).toBe(false);
    controller.abort();
    expect(requestSignal.aborted).toBe(true);
  });

  it('posts only item codes and quantities to obtain server pricing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(quote), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;
    const items = [{ code: 'R01', quantity: 2 }];
    await expect(storeApi.quote(items, signal)).resolves.toEqual(quote);
    expect(fetchMock).toHaveBeenCalledWith('/api/quotes', {
      method: 'POST',
      signal: expect.any(AbortSignal),
      headers: { 'Content-Type': 'application/json' },
      body: '{"items":[{"code":"R01","quantity":2}]}',
    });
  });

  it('uses a safe message for HTTP errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('private server details', { status: 500 })),
    );
    await expect(storeApi.catalog(new AbortController().signal)).rejects.toThrow(
      'The service is temporarily unavailable. Please try again.',
    );
  });

  it('propagates network failures and malformed responses for the UI error state', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Network error'))
      .mockResolvedValueOnce(new Response('broken', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(storeApi.catalog(new AbortController().signal)).rejects.toThrow('Network error');
    await expect(storeApi.catalog(new AbortController().signal)).rejects.toThrow();
  });

  it('limits a stalled request to ten seconds independently of caller cancellation', async () => {
    const timeoutController = new AbortController();
    const callerController = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeoutController.signal);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal!.addEventListener('abort', () => reject(init.signal!.reason), {
              once: true,
            });
          }),
      ),
    );
    const result = storeApi.catalog(callerController.signal);
    const rejection = expect(result).rejects.toThrow('Request timed out');
    timeoutController.abort(new DOMException('Request timed out', 'TimeoutError'));
    await rejection;
    expect(timeout).toHaveBeenCalledWith(10_000);
    expect(callerController.signal.aborted).toBe(false);
  });
});
