import { describe, expect, it, vi } from 'vitest';
import {
  Basket,
  createBasket,
  DELIVERY_RULES,
  DomainError,
  MAX_ITEMS,
  OFFERS,
  PRODUCTS,
  SecondItemHalfPriceOffer,
  TieredDeliveryPolicy,
} from '../src/index.js';
import type { DeliveryPolicy, DeliveryRule, Offer, Product } from '../src/index.js';

const red = PRODUCTS[0]!;
const green = PRODUCTS[1]!;
const blue = PRODUCTS[2]!;

function delivery(): TieredDeliveryPolicy {
  return new TieredDeliveryPolicy(DELIVERY_RULES);
}

function fixedOffer(id: string, amount: number): Offer {
  return { id, name: id, description: id, discount: () => amount };
}

function expectDomainError(action: () => unknown, code: DomainError['code']): void {
  expect(action).toThrow(DomainError);
  expect(action).toThrow(expect.objectContaining({ code, name: 'DomainError' }));
}

describe('challenge acceptance examples', () => {
  it.each([
    [['B01', 'G01'], 37.85, 3785],
    [['R01', 'R01'], 54.37, 5437],
    [['R01', 'G01'], 60.85, 6085],
    [['B01', 'B01', 'R01', 'R01', 'R01'], 98.27, 9827],
  ] as const)('prices %j at $%s', (codes, dollars, cents) => {
    const basket = createBasket();

    for (const code of codes) {
      expect(basket.add(code)).toBe(basket);
    }

    expect(basket.total()).toBe(dollars);
    expect(basket.quote().totalCents).toBe(cents);
  });

  it('returns the full authoritative breakdown', () => {
    expect(createBasket().add('R01', 2).quote()).toEqual({
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
    });
  });

  it('charges no delivery for an empty basket', () => {
    expect(createBasket().quote()).toEqual({
      currency: 'USD',
      items: [],
      itemCount: 0,
      subtotalCents: 0,
      discountCents: 0,
      merchandiseCents: 0,
      deliveryCents: 0,
      totalCents: 0,
      freeDeliveryRemainingCents: 9000,
    });
  });

  it.each([
    [1, 3295, 495],
    [2, 4942, 495],
    [3, 8237, 295],
    [4, 9884, 0],
    [5, 13179, 0],
    [6, 14826, 0],
  ])(
    'rounds every discounted unit down for %i reds',
    (quantity, merchandiseCents, deliveryCents) => {
      expect(createBasket().add('R01', quantity!).quote()).toMatchObject({
        merchandiseCents,
        deliveryCents,
      });
    },
  );

  it('uses discounted merchandise for delivery eligibility', () => {
    expect(createBasket().add('R01', 3).quote()).toMatchObject({
      subtotalCents: 9885,
      merchandiseCents: 8237,
      deliveryCents: 295,
      freeDeliveryRemainingCents: 763,
    });
  });
});

describe('basket invariants', () => {
  it('merges repeated additions and returns stable order', () => {
    const first = createBasket().add('R01').add('B01').add('R01').add('G01').quote();
    const second = createBasket().add('G01').add('R01', 2).add('B01').quote();
    expect(first).toEqual(second);
    expect(first.items.map((item) => item.code)).toEqual(['B01', 'G01', 'R01']);
  });

  it('preserves integer arithmetic and accounting identities across baskets', () => {
    for (let redCount = 0; redCount <= 10; redCount += 1) {
      for (let greenCount = 0; greenCount <= 4; greenCount += 1) {
        for (let blueCount = 0; blueCount <= 4; blueCount += 1) {
          const basket = createBasket();
          const entries: [string, number][] = [
            ['R01', redCount],
            ['G01', greenCount],
            ['B01', blueCount],
          ];

          for (const [code, quantity] of entries) {
            if (quantity > 0) {
              basket.add(code, quantity);
            }
          }

          const quote = basket.quote();
          expect(quote.itemCount).toBe(redCount + greenCount + blueCount);
          expect(quote.subtotalCents).toBe(redCount * 3295 + greenCount * 2495 + blueCount * 795);
          expect(quote.discountCents).toBe(Math.floor(redCount / 2) * 1648);
          expect(quote.merchandiseCents).toBe(quote.subtotalCents - quote.discountCents);
          expect(quote.totalCents).toBe(quote.merchandiseCents + quote.deliveryCents);
          expect(quote.items.reduce((sum, item) => sum + item.totalCents, 0)).toBe(
            quote.merchandiseCents,
          );
          expect(Number.isSafeInteger(quote.totalCents)).toBe(true);
          expect(quote.freeDeliveryRemainingCents).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('accepts exactly the maximum item count', () => {
    const quote = createBasket().add('B01', MAX_ITEMS).quote();
    expect(quote.itemCount).toBe(100);
    expect(quote.totalCents).toBe(79500);
  });

  it('rejects excessive quantities without mutating a basket', () => {
    const basket = createBasket().add('B01', 99);
    const before = basket.quote();
    expectDomainError(() => basket.add('R01', 2), 'BASKET_LIMIT_EXCEEDED');
    expect(basket.quote()).toEqual(before);
    expectDomainError(() => createBasket().add('R01', 101), 'BASKET_LIMIT_EXCEEDED');
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', null])(
    'rejects invalid quantity %s',
    (quantity) => {
      expectDomainError(() => createBasket().add('B01', quantity as number), 'INVALID_QUANTITY');
    },
  );

  it.each(['', 'R02', 'r01', '__proto__', ' R01 ', null, 42])(
    'rejects unknown product %s',
    (code) => {
      expectDomainError(() => createBasket().add(code as string), 'UNKNOWN_PRODUCT');
    },
  );

  it('returns independent quotes', () => {
    const basket = createBasket().add('R01', 2);
    const first = basket.quote();
    first.items.splice(0);
    expect(basket.quote().items).toHaveLength(1);
    basket.add('B01');
    expect(first.itemCount).toBe(2);
    expect(basket.quote().itemCount).toBe(3);
  });

  it('defensively copies catalog values and arrays', () => {
    const product = { ...red };
    const catalog: Product[] = [product];
    const basket = new Basket({ catalog, deliveryPolicy: delivery() }).add('R01');
    product.priceCents = 1;
    product.name = 'Changed';
    catalog.length = 0;
    expect(basket.quote().items[0]).toMatchObject({ name: 'Red Widget', unitPriceCents: 3295 });
  });

  it('defensively copies offer arrays and calculation functions', () => {
    const offer = fixedOffer('fixed', 100);
    const offers = [offer];
    const basket = new Basket({ catalog: PRODUCTS, deliveryPolicy: delivery(), offers }).add('R01');
    offer.discount = () => 500;
    offers.length = 0;
    expect(basket.quote().discountCents).toBe(100);
  });

  it('defensively copies delivery configuration and calculation functions', () => {
    const policy = { freeDeliveryThresholdCents: 9000, charge: () => 100 };
    const basket = new Basket({ catalog: PRODUCTS, deliveryPolicy: policy }).add('R01');
    policy.freeDeliveryThresholdCents = 10000;
    policy.charge = () => 999;
    expect(basket.quote()).toMatchObject({ deliveryCents: 100, freeDeliveryRemainingCents: 5705 });
  });

  it('selects the best offer without stacking discounts', () => {
    const basket = new Basket({
      catalog: PRODUCTS,
      deliveryPolicy: delivery(),
      offers: [fixedOffer('first', 100), fixedOffer('second', 500), fixedOffer('third', 200)],
    }).add('R01');
    expect(basket.quote().discountCents).toBe(500);
  });

  it('supports injected catalog prices, offers, and delivery policies', () => {
    const charge = vi.fn(() => 42);
    const basket = new Basket({
      catalog: [{ ...red, code: 'CUSTOM', priceCents: 1000 }],
      deliveryPolicy: { freeDeliveryThresholdCents: 2000, charge },
      offers: [fixedOffer('custom', 250)],
    }).add('CUSTOM');
    expect(basket.quote()).toMatchObject({
      merchandiseCents: 750,
      deliveryCents: 42,
      totalCents: 792,
    });
    expect(charge).toHaveBeenCalledWith(750);
  });

  it('does not call the delivery policy for an empty basket', () => {
    const charge = vi.fn(() => 42);
    new Basket({
      catalog: PRODUCTS,
      deliveryPolicy: { freeDeliveryThresholdCents: 100, charge },
    }).quote();
    expect(charge).not.toHaveBeenCalled();
  });

  it('freezes products passed to an offer', () => {
    const discount = vi.fn((product: Product) => {
      expect(Object.isFrozen(product)).toBe(true);
      return 0;
    });
    new Basket({
      catalog: PRODUCTS,
      deliveryPolicy: delivery(),
      offers: [{ ...fixedOffer('immutable', 0), discount }],
    })
      .add('R01')
      .quote();
    expect(discount).toHaveBeenCalledOnce();
  });
});

describe('dependency validation', () => {
  it.each([[], null, {}, 'catalog'])('rejects invalid catalog %j', (catalog) => {
    expectDomainError(
      () => new Basket({ catalog: catalog as readonly Product[], deliveryPolicy: delivery() }),
      'INVALID_CATALOG',
    );
  });

  it.each([
    null,
    42,
    { ...red, code: null },
    { ...red, code: '' },
    { ...red, name: null },
    { ...red, name: '  ' },
    { ...red, description: null },
    { ...red, color: 'pink' },
    { ...red, priceCents: -1 },
    { ...red, priceCents: 1.5 },
    { ...red, priceCents: 0 },
    { ...red, priceCents: Number.MAX_SAFE_INTEGER },
  ])('rejects invalid product %j', (product) => {
    expectDomainError(
      () => new Basket({ catalog: [product as Product], deliveryPolicy: delivery() }),
      'INVALID_CATALOG',
    );
  });

  it('rejects duplicate product codes', () => {
    expectDomainError(
      () => new Basket({ catalog: [red, red], deliveryPolicy: delivery() }),
      'INVALID_CATALOG',
    );
  });

  it.each([null, 42, {}, { charge: 42 }, { charge: () => 0, freeDeliveryThresholdCents: -1 }])(
    'rejects invalid delivery policy %j',
    (policy) => {
      expectDomainError(
        () => new Basket({ catalog: PRODUCTS, deliveryPolicy: policy as DeliveryPolicy }),
        'INVALID_DELIVERY_POLICY',
      );
    },
  );

  it.each([null, {}])('rejects a non-array offer collection %j', (offers) => {
    expectDomainError(
      () =>
        new Basket({
          catalog: PRODUCTS,
          deliveryPolicy: delivery(),
          offers: offers as unknown as Offer[],
        }),
      'INVALID_OFFER',
    );
  });

  it.each([
    null,
    42,
    { ...fixedOffer('offer', 1), id: 42 },
    { ...fixedOffer('offer', 1), id: ' ' },
    { ...fixedOffer('offer', 1), name: null },
    { ...fixedOffer('offer', 1), description: null },
    { ...fixedOffer('offer', 1), discount: null },
  ])('rejects malformed offer %j', (offer) => {
    expectDomainError(
      () => new Basket({ catalog: PRODUCTS, deliveryPolicy: delivery(), offers: [offer as Offer] }),
      'INVALID_OFFER',
    );
  });

  it('rejects duplicate offer identifiers', () => {
    expectDomainError(
      () =>
        new Basket({
          catalog: PRODUCTS,
          deliveryPolicy: delivery(),
          offers: [fixedOffer('same', 1), fixedOffer('same', 2)],
        }),
      'INVALID_OFFER',
    );
  });

  it.each([-1, 1.5, NaN, Infinity, 3296])('rejects invalid calculated discount %s', (amount) => {
    const basket = new Basket({
      catalog: PRODUCTS,
      deliveryPolicy: delivery(),
      offers: [fixedOffer('invalid', amount)],
    }).add('R01');
    expectDomainError(() => basket.quote(), 'INVALID_OFFER');
  });

  it.each([-1, 1.5, NaN, Infinity])('rejects invalid calculated delivery %s', (amount) => {
    const basket = new Basket({
      catalog: PRODUCTS,
      deliveryPolicy: { freeDeliveryThresholdCents: 9000, charge: () => amount },
    }).add('R01');
    expectDomainError(() => basket.quote(), 'INVALID_DELIVERY_POLICY');
  });

  it('rejects a total outside the safe integer range', () => {
    const basket = new Basket({
      catalog: PRODUCTS,
      deliveryPolicy: { freeDeliveryThresholdCents: 9000, charge: () => Number.MAX_SAFE_INTEGER },
    }).add('R01');
    expectDomainError(() => basket.quote(), 'INVALID_PRICE');
  });
});

describe('tiered delivery', () => {
  it.each([
    [0, 495],
    [1, 495],
    [4999, 495],
    [5000, 295],
    [8999, 295],
    [9000, 0],
    [9001, 0],
  ])('charges %i cents as %i', (merchandiseCents, expected) => {
    expect(delivery().charge(merchandiseCents!)).toBe(expected);
  });

  it('supports unsorted rules and copies their values', () => {
    const rules = [
      { minimumCents: 100, chargeCents: 0 },
      { minimumCents: 0, chargeCents: 50 },
    ];
    const policy = new TieredDeliveryPolicy(rules);
    rules[1]!.chargeCents = 999;
    rules.length = 0;
    expect(policy.charge(99)).toBe(50);
    expect(policy.freeDeliveryThresholdCents).toBe(100);
  });

  it('supports always-free delivery', () => {
    const policy = new TieredDeliveryPolicy([{ minimumCents: 0, chargeCents: 0 }]);
    expect(policy.charge(100)).toBe(0);
    expect(policy.freeDeliveryThresholdCents).toBe(0);
  });

  it.each([-1, 1.5, NaN, Infinity])('rejects invalid merchandise %s', (amount) => {
    expectDomainError(() => delivery().charge(amount), 'INVALID_PRICE');
  });

  it.each([
    null,
    {},
    [],
    [null],
    [42],
    [{ minimumCents: -1, chargeCents: 0 }],
    [{ minimumCents: 0, chargeCents: -1 }],
    [{ minimumCents: 1, chargeCents: 0 }],
    [{ minimumCents: 0, chargeCents: 1 }],
    [
      { minimumCents: 0, chargeCents: 1 },
      { minimumCents: 0, chargeCents: 0 },
    ],
    [
      { minimumCents: 0, chargeCents: 1 },
      { minimumCents: 100, chargeCents: 2 },
      { minimumCents: 200, chargeCents: 0 },
    ],
    [
      { minimumCents: 0, chargeCents: 1 },
      { minimumCents: 100, chargeCents: 1 },
      { minimumCents: 200, chargeCents: 0 },
    ],
  ])('rejects malformed delivery rules %j', (rules) => {
    expectDomainError(
      () => new TieredDeliveryPolicy(rules as readonly DeliveryRule[]),
      'INVALID_DELIVERY_POLICY',
    );
  });
});

describe('second item half price', () => {
  const offer = new SecondItemHalfPriceOffer('R01', 'Red Widget');

  it.each([
    [0, 0],
    [1, 0],
    [2, 1648],
    [3, 1648],
    [4, 3296],
    [5, 3296],
    [100, 82400],
  ])('discounts quantity %i by %i cents', (quantity, discountCents) => {
    expect(offer.discount(red, quantity!)).toBe(discountCents);
  });

  it('only discounts the configured product', () => {
    expect(offer.discount(green, 2)).toBe(0);
    expect(offer.discount(blue, 2)).toBe(0);
  });

  it('supports even-cent prices without a rounding difference', () => {
    expect(offer.discount({ ...red, priceCents: 1000 }, 2)).toBe(500);
  });

  it('exposes readable offer metadata', () => {
    expect(offer.id).toBe('R01-SECOND-HALF-PRICE');
    expect(offer.name).toBe('Every second one, half price');
    expect(offer.description).toContain('red widget');
    expect(offer.description).toContain('rounded down');
  });

  it.each([-1, 1.5, NaN, Infinity, 101])('rejects invalid offer quantity %s', (quantity) => {
    expectDomainError(() => offer.discount(red, quantity), 'INVALID_QUANTITY');
  });

  it.each([
    [null, 'Red'],
    ['', 'Red'],
    ['R01', null],
    ['R01', ' '],
  ])('rejects invalid offer configuration %j %j', (code, name) => {
    expectDomainError(
      () => new SecondItemHalfPriceOffer(code as string, name as string),
      'INVALID_OFFER',
    );
  });
});

describe('published defaults', () => {
  it('provides deeply immutable configuration', () => {
    expect(PRODUCTS).toHaveLength(3);
    expect(DELIVERY_RULES).toEqual([
      { minimumCents: 0, chargeCents: 495 },
      { minimumCents: 5000, chargeCents: 295 },
      { minimumCents: 9000, chargeCents: 0 },
    ]);
    expect(OFFERS).toHaveLength(1);

    for (const collection of [PRODUCTS, DELIVERY_RULES, OFFERS]) {
      expect(Object.isFrozen(collection)).toBe(true);

      for (const value of collection) {
        expect(Object.isFrozen(value)).toBe(true);
      }
    }
  });

  it('creates independent baskets', () => {
    const first = createBasket().add('R01');
    const second = createBasket();
    expect(first.quote().itemCount).toBe(1);
    expect(second.quote().itemCount).toBe(0);
  });

  it('preserves domain error identity and details', () => {
    const error = new DomainError('UNKNOWN_PRODUCT', 'No such product.');
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('UNKNOWN_PRODUCT');
    expect(error.message).toBe('No such product.');
    expect(error.name).toBe('DomainError');
  });
});
