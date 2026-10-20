import { Basket } from './basket.js';
import { TieredDeliveryPolicy } from './delivery.js';
import { SecondItemHalfPriceOffer } from './offers.js';
import type { DeliveryRule, Offer, Product } from './types.js';

export const PRODUCTS: readonly Product[] = Object.freeze([
  Object.freeze({
    code: 'R01',
    name: 'Red Widget',
    priceCents: 3295,
    color: 'red',
    description: 'A confident classic. Precision made, ready for everyday work.',
  } as const),
  Object.freeze({
    code: 'G01',
    name: 'Green Widget',
    priceCents: 2495,
    color: 'green',
    description: 'The versatile essential. A fresh perspective on getting things done.',
  } as const),
  Object.freeze({
    code: 'B01',
    name: 'Blue Widget',
    priceCents: 795,
    color: 'blue',
    description: 'Small in size, generous in possibility. Your dependable daily companion.',
  } as const),
]);

export const DELIVERY_RULES: readonly DeliveryRule[] = Object.freeze([
  Object.freeze({ minimumCents: 0, chargeCents: 495 }),
  Object.freeze({ minimumCents: 5000, chargeCents: 295 }),
  Object.freeze({ minimumCents: 9000, chargeCents: 0 }),
]);

export const PROMOTED_PRODUCT_CODE = 'R01';

export const OFFERS: readonly Offer[] = Object.freeze([
  Object.freeze(new SecondItemHalfPriceOffer(PROMOTED_PRODUCT_CODE, 'Red Widget')),
]);

export function createBasket(): Basket {
  return new Basket({
    catalog: PRODUCTS,
    deliveryPolicy: new TieredDeliveryPolicy(DELIVERY_RULES),
    offers: OFFERS,
  });
}
