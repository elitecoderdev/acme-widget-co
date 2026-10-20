import { MAX_ITEMS } from '@acme/domain';
import type { BasketItem } from './api';

export { MAX_ITEMS } from '@acme/domain';

const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function countItems(items: BasketItem[]): number {
  return items.reduce((total, item) => total + item.quantity, 0);
}

export function changeQuantity(items: BasketItem[], code: string, delta: -1 | 1): BasketItem[] {
  if (delta > 0 && countItems(items) >= MAX_ITEMS) return items;
  const existing = items.find((item) => item.code === code);
  if (!existing) return delta > 0 ? [...items, { code, quantity: 1 }] : items;
  return items
    .map((item) => (item.code === code ? { ...item, quantity: item.quantity + delta } : item))
    .filter((item) => item.quantity > 0);
}

export function money(cents: number): string {
  return currencyFormatter.format(cents / 100);
}
