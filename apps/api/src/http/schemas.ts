import { MAX_ITEMS } from '@acme/domain';

const money = { type: 'integer', minimum: 0 };

const lineProperties = {
  code: { type: 'string' },
  name: { type: 'string' },
  quantity: { type: 'integer', minimum: 1 },
  unitPriceCents: money,
  subtotalCents: money,
  discountCents: money,
  totalCents: money,
};

const quoteProperties = {
  currency: { type: 'string', const: 'USD' },
  items: {
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      required: Object.keys(lineProperties),
      properties: lineProperties,
    },
  },
  itemCount: money,
  subtotalCents: money,
  discountCents: money,
  merchandiseCents: money,
  deliveryCents: money,
  totalCents: money,
  freeDeliveryRemainingCents: money,
};

export const quoteSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        maxItems: MAX_ITEMS,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['code', 'quantity'],
          properties: {
            code: { type: 'string', pattern: '^[A-Z][0-9]{2}$' },
            quantity: { type: 'integer', minimum: 1, maximum: MAX_ITEMS },
          },
        },
      },
    },
  },
  response: {
    200: {
      type: 'object',
      additionalProperties: false,
      required: Object.keys(quoteProperties),
      properties: quoteProperties,
    },
  },
};
