import { DELIVERY_RULES, PRODUCTS, PROMOTED_PRODUCT_CODE } from '@acme/domain';
import { QuoteBasket } from './quote-basket.js';

const examples = [
  {
    label: 'Blue + green',
    items: [
      { code: 'B01', quantity: 1 },
      { code: 'G01', quantity: 1 },
    ],
  },
  { label: 'A pair of reds', items: [{ code: 'R01', quantity: 2 }] },
  {
    label: 'Red + green',
    items: [
      { code: 'R01', quantity: 1 },
      { code: 'G01', quantity: 1 },
    ],
  },
  {
    label: 'Three reds, two blues',
    items: [
      { code: 'R01', quantity: 3 },
      { code: 'B01', quantity: 2 },
    ],
  },
];

export function getCatalog() {
  const quotes = new QuoteBasket();
  return {
    products: PRODUCTS,
    deliveryRules: DELIVERY_RULES,
    offer: {
      productCode: PROMOTED_PRODUCT_CODE,
      badge: '2nd one half price',
      label: 'Red pair offer',
      title: 'A little more red. A lot more value.',
      description:
        'Buy one Red Widget and get your second half price. Applied automatically to every pair.',
    },
    examples: examples.map((example) => ({
      ...example,
      totalCents: quotes.execute(example.items).totalCents,
    })),
  };
}
