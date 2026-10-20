import { DomainError } from './errors.js';
import { MAX_ITEMS } from './money.js';
import type { Offer, Product } from './types.js';

export class SecondItemHalfPriceOffer implements Offer {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  private readonly productCode: string;

  constructor(productCode: string, productName: string) {
    if (
      typeof productCode !== 'string' ||
      productCode.trim().length === 0 ||
      typeof productName !== 'string' ||
      productName.trim().length === 0
    ) {
      throw new DomainError('INVALID_OFFER', 'An offer requires a product code and name.');
    }

    this.productCode = productCode;
    this.id = `${productCode}-SECOND-HALF-PRICE`;
    this.name = 'Every second one, half price';
    this.description = `Buy one ${productName.toLowerCase()} and get the second half price. Discounted unit prices are rounded down to the nearest cent.`;
  }

  discount(product: Product, quantity: number): number {
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > MAX_ITEMS) {
      throw new DomainError(
        'INVALID_QUANTITY',
        `Offer quantities must be whole numbers from 0 to ${MAX_ITEMS}.`,
      );
    }

    if (product.code !== this.productCode) {
      return 0;
    }

    return Math.floor(quantity / 2) * (product.priceCents - Math.floor(product.priceCents / 2));
  }
}
