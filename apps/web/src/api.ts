import type { BasketQuote, DeliveryRule, Product } from '@acme/domain';

export type { BasketQuote, Product } from '@acme/domain';

export interface Catalog {
  products: Product[];
  deliveryRules: DeliveryRule[];
  offer: { productCode: string; badge: string; label: string; title: string; description: string };
  examples: { label: string; totalCents: number; items: BasketItem[] }[];
}

export interface BasketItem {
  code: string;
  quantity: number;
}

export interface StoreApi {
  catalog(signal: AbortSignal): Promise<Catalog>;
  quote(items: BasketItem[], signal: AbortSignal): Promise<BasketQuote>;
}

async function request<T>(url: string, init: RequestInit & { signal: AbortSignal }): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.any([init.signal, AbortSignal.timeout(10_000)]),
  });
  if (!response.ok) {
    throw new Error('The service is temporarily unavailable. Please try again.');
  }
  return response.json() as Promise<T>;
}

export const storeApi: StoreApi = {
  catalog: (signal) => request<Catalog>('/api/catalog', { signal }),
  quote: (items, signal) =>
    request<BasketQuote>('/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
      signal,
    }),
};
