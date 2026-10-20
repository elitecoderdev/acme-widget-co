import { describe, expect, it } from 'vitest';
import { changeQuantity, countItems, MAX_ITEMS, money } from '../src/basket';

describe('basket operations', () => {
  it('counts all item quantities and an empty basket', () => {
    expect(countItems([])).toBe(0);
    expect(
      countItems([
        { code: 'R01', quantity: 2 },
        { code: 'B01', quantity: 3 },
      ]),
    ).toBe(5);
  });

  it('adds an item without mutating the original basket', () => {
    const items = [{ code: 'R01', quantity: 1 }];
    expect(changeQuantity(items, 'G01', 1)).toEqual([...items, { code: 'G01', quantity: 1 }]);
    expect(items).toEqual([{ code: 'R01', quantity: 1 }]);
  });

  it('changes only the requested item and removes a zero quantity', () => {
    const items = [
      { code: 'R01', quantity: 2 },
      { code: 'B01', quantity: 1 },
    ];
    expect(changeQuantity(items, 'R01', 1)).toEqual([
      { code: 'R01', quantity: 3 },
      { code: 'B01', quantity: 1 },
    ]);
    expect(changeQuantity(items, 'R01', -1)).toEqual([
      { code: 'R01', quantity: 1 },
      { code: 'B01', quantity: 1 },
    ]);
    expect(changeQuantity(items, 'B01', -1)).toEqual([{ code: 'R01', quantity: 2 }]);
    expect(items).toEqual([
      { code: 'R01', quantity: 2 },
      { code: 'B01', quantity: 1 },
    ]);
  });

  it('ignores a decrease for an absent item', () => {
    const items = [{ code: 'R01', quantity: 1 }];
    expect(changeQuantity(items, 'B01', -1)).toBe(items);
  });

  it('caps the entire basket while still allowing a decrease', () => {
    const items = [
      { code: 'R01', quantity: 70 },
      { code: 'G01', quantity: 30 },
    ];
    expect(countItems(items)).toBe(MAX_ITEMS);
    expect(changeQuantity(items, 'R01', 1)).toBe(items);
    expect(changeQuantity(items, 'B01', 1)).toBe(items);
    expect(countItems(changeQuantity(items, 'R01', -1))).toBe(99);
  });

  it('formats integer cents consistently in US dollars', () => {
    expect(money(0)).toBe('$0.00');
    expect(money(795)).toBe('$7.95');
    expect(money(123456)).toBe('$1,234.56');
  });
});
