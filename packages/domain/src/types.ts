export interface Product {
  readonly code: string;
  readonly name: string;
  readonly priceCents: number;
  readonly color: 'red' | 'green' | 'blue';
  readonly description: string;
}

export interface DeliveryRule {
  readonly minimumCents: number;
  readonly chargeCents: number;
}

export interface DeliveryPolicy {
  readonly freeDeliveryThresholdCents: number;
  charge(merchandiseCents: number): number;
}

export interface Offer {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  discount(product: Product, quantity: number): number;
}

export interface BasketDependencies {
  readonly catalog: readonly Product[];
  readonly deliveryPolicy: DeliveryPolicy;
  readonly offers?: readonly Offer[];
}

export interface QuoteLine {
  readonly code: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPriceCents: number;
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly totalCents: number;
}

export interface BasketQuote {
  readonly currency: 'USD';
  readonly items: QuoteLine[];
  readonly itemCount: number;
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly merchandiseCents: number;
  readonly deliveryCents: number;
  readonly totalCents: number;
  readonly freeDeliveryRemainingCents: number;
}
