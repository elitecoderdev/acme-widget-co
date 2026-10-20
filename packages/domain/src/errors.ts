export type DomainErrorCode =
  | 'INVALID_CATALOG'
  | 'UNKNOWN_PRODUCT'
  | 'INVALID_QUANTITY'
  | 'BASKET_LIMIT_EXCEEDED'
  | 'INVALID_DELIVERY_POLICY'
  | 'INVALID_OFFER'
  | 'INVALID_PRICE';

export class DomainError extends Error {
  override readonly name = 'DomainError';

  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
  }
}
