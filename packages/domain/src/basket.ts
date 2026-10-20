import { DomainError } from './errors.js';
import { assertCents, MAX_ITEMS } from './money.js';
import type {
  BasketDependencies,
  BasketQuote,
  DeliveryPolicy,
  Offer,
  Product,
  QuoteLine,
} from './types.js';

function copyCatalog(catalog: readonly Product[]): Map<string, Product> {
  if (!Array.isArray(catalog) || catalog.length === 0) {
    throw new DomainError('INVALID_CATALOG', 'A nonempty product catalog is required.');
  }

  const products = new Map<string, Product>();

  for (const product of catalog) {
    if (product === null || typeof product !== 'object') {
      throw new DomainError('INVALID_CATALOG', 'Catalog products must be objects.');
    }

    if (
      typeof product.code !== 'string' ||
      product.code.trim().length === 0 ||
      typeof product.name !== 'string' ||
      product.name.trim().length === 0 ||
      typeof product.description !== 'string' ||
      !['red', 'green', 'blue'].includes(product.color)
    ) {
      throw new DomainError(
        'INVALID_CATALOG',
        'Products require a code, name, description, and supported color.',
      );
    }

    assertCents(
      product.priceCents,
      'INVALID_CATALOG',
      'Product prices must be nonnegative integer cents.',
    );

    if (
      product.priceCents === 0 ||
      product.priceCents > Math.floor(Number.MAX_SAFE_INTEGER / MAX_ITEMS) ||
      products.has(product.code)
    ) {
      throw new DomainError(
        'INVALID_CATALOG',
        'Product prices must be positive and safely bounded, and codes must be unique.',
      );
    }

    products.set(
      product.code,
      Object.freeze({
        code: product.code,
        name: product.name,
        priceCents: product.priceCents,
        color: product.color,
        description: product.description,
      }),
    );
  }

  return products;
}

function copyDeliveryPolicy(policy: DeliveryPolicy): DeliveryPolicy {
  if (policy === null || typeof policy !== 'object' || typeof policy.charge !== 'function') {
    throw new DomainError('INVALID_DELIVERY_POLICY', 'A delivery policy is required.');
  }

  assertCents(
    policy.freeDeliveryThresholdCents,
    'INVALID_DELIVERY_POLICY',
    'The free delivery threshold must be nonnegative integer cents.',
  );

  return Object.freeze({
    freeDeliveryThresholdCents: policy.freeDeliveryThresholdCents,
    charge: policy.charge.bind(policy),
  });
}

function copyOffers(offers: readonly Offer[]): readonly Offer[] {
  if (!Array.isArray(offers)) {
    throw new DomainError('INVALID_OFFER', 'Offers must be an array.');
  }

  const ids = new Set<string>();

  return Object.freeze(
    offers.map((offer: Offer) => {
      if (
        offer === null ||
        typeof offer !== 'object' ||
        typeof offer.id !== 'string' ||
        offer.id.trim().length === 0 ||
        typeof offer.name !== 'string' ||
        typeof offer.description !== 'string' ||
        typeof offer.discount !== 'function' ||
        ids.has(offer.id)
      ) {
        throw new DomainError(
          'INVALID_OFFER',
          'Offers require a unique identifier, name, description, and discount calculation.',
        );
      }

      ids.add(offer.id);

      return Object.freeze({
        id: offer.id,
        name: offer.name,
        description: offer.description,
        discount: offer.discount.bind(offer),
      });
    }),
  );
}

export class Basket {
  private readonly products: Map<string, Product>;
  private readonly deliveryPolicy: DeliveryPolicy;
  private readonly offers: readonly Offer[];
  private readonly quantities = new Map<string, number>();
  private itemCount = 0;

  constructor({ catalog, deliveryPolicy, offers = [] }: BasketDependencies) {
    this.products = copyCatalog(catalog);
    this.deliveryPolicy = copyDeliveryPolicy(deliveryPolicy);
    this.offers = copyOffers(offers);
  }

  add(code: string, quantity = 1): this {
    if (!this.products.has(code)) {
      throw new DomainError('UNKNOWN_PRODUCT', 'The requested product does not exist.');
    }

    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      throw new DomainError('INVALID_QUANTITY', 'Quantity must be a positive whole number.');
    }

    if (this.itemCount + quantity > MAX_ITEMS) {
      throw new DomainError(
        'BASKET_LIMIT_EXCEEDED',
        `A basket may contain at most ${MAX_ITEMS} items.`,
      );
    }

    this.quantities.set(code, (this.quantities.get(code) ?? 0) + quantity);
    this.itemCount += quantity;

    return this;
  }

  quote(): BasketQuote {
    const items: QuoteLine[] = [...this.quantities.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([code, quantity]) => {
        const product = this.products.get(code)!;
        const subtotalCents = product.priceCents * quantity;
        let discountCents = 0;

        for (const offer of this.offers) {
          const offeredDiscount = offer.discount(product, quantity);
          assertCents(
            offeredDiscount,
            'INVALID_OFFER',
            'Offer discounts must be nonnegative integer cents.',
          );

          if (offeredDiscount > subtotalCents) {
            throw new DomainError(
              'INVALID_OFFER',
              'Offer discounts cannot exceed a line subtotal.',
            );
          }

          discountCents = Math.max(discountCents, offeredDiscount);
        }

        return {
          code,
          name: product.name,
          quantity,
          unitPriceCents: product.priceCents,
          subtotalCents,
          discountCents,
          totalCents: subtotalCents - discountCents,
        };
      });

    const subtotalCents = items.reduce((sum, item) => sum + item.subtotalCents, 0);
    const discountCents = items.reduce((sum, item) => sum + item.discountCents, 0);
    const merchandiseCents = subtotalCents - discountCents;
    const deliveryCents = this.itemCount === 0 ? 0 : this.deliveryPolicy.charge(merchandiseCents);
    assertCents(
      deliveryCents,
      'INVALID_DELIVERY_POLICY',
      'Delivery charges must be nonnegative integer cents.',
    );
    const totalCents = merchandiseCents + deliveryCents;
    assertCents(totalCents, 'INVALID_PRICE', 'The basket total exceeds the supported price range.');

    return {
      currency: 'USD',
      items,
      itemCount: this.itemCount,
      subtotalCents,
      discountCents,
      merchandiseCents,
      deliveryCents,
      totalCents,
      freeDeliveryRemainingCents: Math.max(
        0,
        this.deliveryPolicy.freeDeliveryThresholdCents - merchandiseCents,
      ),
    };
  }

  total(): number {
    return this.quote().totalCents / 100;
  }
}
