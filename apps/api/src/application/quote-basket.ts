import { createBasket, type BasketQuote, type Basket } from '@acme/domain';

export interface BasketItem {
  code: string;
  quantity: number;
}

export interface QuoteService {
  execute(items: readonly BasketItem[]): BasketQuote;
}

export class QuoteBasket implements QuoteService {
  constructor(private readonly basketFactory: () => Basket = createBasket) {}

  execute(items: readonly BasketItem[]): BasketQuote {
    const basket = this.basketFactory();
    for (const item of items) basket.add(item.code, item.quantity);
    return basket.quote();
  }
}
