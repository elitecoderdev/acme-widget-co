import { DomainError } from './errors.js';
import type { DomainErrorCode } from './errors.js';

export const MAX_ITEMS = 100;

export function assertCents(value: number, code: DomainErrorCode, message: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainError(code, message);
  }
}
