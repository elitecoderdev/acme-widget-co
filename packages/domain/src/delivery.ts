import { DomainError } from './errors.js';
import { assertCents } from './money.js';
import type { DeliveryPolicy, DeliveryRule } from './types.js';

export class TieredDeliveryPolicy implements DeliveryPolicy {
  readonly freeDeliveryThresholdCents: number;
  private readonly rules: readonly DeliveryRule[];

  constructor(rules: readonly DeliveryRule[]) {
    if (!Array.isArray(rules) || rules.length === 0) {
      throw new DomainError('INVALID_DELIVERY_POLICY', 'Delivery rules are required.');
    }

    const copiedRules = rules
      .map((rule: DeliveryRule) => {
        if (rule === null || typeof rule !== 'object') {
          throw new DomainError('INVALID_DELIVERY_POLICY', 'Delivery rules must be objects.');
        }

        assertCents(
          rule.minimumCents,
          'INVALID_DELIVERY_POLICY',
          'Delivery thresholds must be nonnegative integer cents.',
        );
        assertCents(
          rule.chargeCents,
          'INVALID_DELIVERY_POLICY',
          'Delivery charges must be nonnegative integer cents.',
        );

        return Object.freeze({ minimumCents: rule.minimumCents, chargeCents: rule.chargeCents });
      })
      .sort((left, right) => left.minimumCents - right.minimumCents);

    const first = copiedRules[0]!;
    const last = copiedRules[copiedRules.length - 1]!;

    if (first.minimumCents !== 0 || last.chargeCents !== 0) {
      throw new DomainError(
        'INVALID_DELIVERY_POLICY',
        'Delivery rules must start at zero and end with free delivery.',
      );
    }

    for (let index = 1; index < copiedRules.length; index += 1) {
      const previous = copiedRules[index - 1]!;
      const current = copiedRules[index]!;

      if (
        current.minimumCents === previous.minimumCents ||
        current.chargeCents >= previous.chargeCents
      ) {
        throw new DomainError(
          'INVALID_DELIVERY_POLICY',
          'Delivery thresholds must increase and charges must decrease.',
        );
      }
    }

    this.rules = Object.freeze(copiedRules);
    this.freeDeliveryThresholdCents = last.minimumCents;
  }

  charge(merchandiseCents: number): number {
    assertCents(
      merchandiseCents,
      'INVALID_PRICE',
      'Merchandise must be nonnegative integer cents.',
    );
    let chargeCents = this.rules[0]!.chargeCents;

    for (const rule of this.rules) {
      if (merchandiseCents < rule.minimumCents) {
        break;
      }

      chargeCents = rule.chargeCents;
    }

    return chargeCents;
  }
}
