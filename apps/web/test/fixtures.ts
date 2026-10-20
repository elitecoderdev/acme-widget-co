import { vi } from 'vitest';
import type { BasketQuote, Catalog, StoreApi } from '../src/api';

export const catalog: Catalog = {
  products: [
    {
      code: 'R01',
      name: 'Red Widget',
      priceCents: 3295,
      color: 'red',
      description: 'A bold little original. Made to stand out.',
    },
    {
      code: 'G01',
      name: 'Green Widget',
      priceCents: 2495,
      color: 'green',
      description: 'Quietly capable. Naturally at home.',
    },
    {
      code: 'B01',
      name: 'Blue Widget',
      priceCents: 795,
      color: 'blue',
      description: 'Your everyday go-to. Simply versatile.',
    },
  ],
  deliveryRules: [
    { minimumCents: 0, chargeCents: 495 },
    { minimumCents: 5000, chargeCents: 295 },
    { minimumCents: 9000, chargeCents: 0 },
  ],
  offer: {
    productCode: 'R01',
    badge: '2nd one half price',
    label: 'Red pair offer',
    title: 'Good things come in pairs.',
    description: 'Buy one Red Widget, get the second half price.',
  },
  examples: [
    {
      label: 'Blue + green',
      totalCents: 3785,
      items: [
        { code: 'B01', quantity: 1 },
        { code: 'G01', quantity: 1 },
      ],
    },
    { label: 'A pair of reds', totalCents: 5437, items: [{ code: 'R01', quantity: 2 }] },
    {
      label: 'Red + green',
      totalCents: 6085,
      items: [
        { code: 'R01', quantity: 1 },
        { code: 'G01', quantity: 1 },
      ],
    },
    {
      label: 'Three reds, two blues',
      totalCents: 9827,
      items: [
        { code: 'R01', quantity: 3 },
        { code: 'B01', quantity: 2 },
      ],
    },
  ],
};

export const quote: BasketQuote = {
  currency: 'USD',
  items: [
    {
      code: 'R01',
      name: 'Red Widget',
      quantity: 2,
      unitPriceCents: 3295,
      subtotalCents: 6590,
      discountCents: 1648,
      totalCents: 4942,
    },
  ],
  itemCount: 2,
  subtotalCents: 6590,
  discountCents: 1648,
  merchandiseCents: 4942,
  deliveryCents: 495,
  totalCents: 5437,
  freeDeliveryRemainingCents: 4058,
};

export function createApi(): StoreApi {
  return { catalog: vi.fn().mockResolvedValue(catalog), quote: vi.fn().mockResolvedValue(quote) };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((fulfill, fail) => {
    resolve = fulfill;
    reject = fail;
  });
  return { promise, resolve, reject };
}
