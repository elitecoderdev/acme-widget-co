import { useEffect, useState } from 'react';
import type { BasketItem, BasketQuote, Catalog, StoreApi } from './api';

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: T };

export function useCatalog(api: StoreApi) {
  const [state, setState] = useState<LoadState<Catalog>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({ status: 'loading' });
    void api.catalog(controller.signal).then(
      (data) => {
        if (active) setState({ status: 'ready', data });
      },
      () => {
        if (active) setState({ status: 'error' });
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [api, attempt]);

  return { state, retry: () => setAttempt((value) => value + 1) };
}

export function useQuote(api: StoreApi, items: BasketItem[]) {
  const [state, setState] = useState<LoadState<BasketQuote>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (items.length === 0) return;
    const controller = new AbortController();
    let active = true;
    setState({ status: 'loading' });
    void api.quote(items, controller.signal).then(
      (data) => {
        if (active) setState({ status: 'ready', data });
      },
      () => {
        if (active) setState({ status: 'error' });
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [api, items, attempt]);

  return { state, retry: () => setAttempt((value) => value + 1) };
}
