// What each service costs, and how it is described on the payment screen.
//
// The price is read from here and never from the request: the payment screen
// is told the amount by GET /cases/:id/payment and the same table is used
// again when the payment is recorded, so a tampered request cannot change
// what is charged or what gets written to the case.
import { AGREEMENT_TYPES } from './schemas/case.schema';

export type AgreementTypeId = (typeof AGREEMENT_TYPES)[number];

export const PAYMENT_CURRENCY = 'GBP';

export type ServicePrice = {
  name: string;
  description: string;
  // Whole pounds, to two decimal places.
  amount: number;
};

export const SERVICE_PRICING: Record<AgreementTypeId, ServicePrice> = {
  'prenup-marriage': {
    name: 'Prenuptial Agreement (Marriage)',
    description:
      'For couples planning to get married, including drafting and independent legal advice.',
    amount: 499,
  },
  'prenup-civil': {
    name: 'Prenuptial Agreement (Civil Partnership)',
    description:
      'For couples planning to enter a civil partnership, including drafting and independent legal advice.',
    amount: 499,
  },
  'postnup-marriage': {
    name: 'Postnuptial Agreement (Marriage)',
    description:
      'For couples who are already married, including drafting and independent legal advice.',
    amount: 549,
  },
  'postnup-civil': {
    name: 'Postnuptial Agreement (Civil Partnership)',
    description:
      'For couples already in a civil partnership, including drafting and independent legal advice.',
    amount: 549,
  },
  cohabitation: {
    name: 'Cohabitation Agreement',
    description:
      'For couples living together without marrying, including drafting and independent legal advice.',
    amount: 399,
  },
  // Not a service that can be paid for: the couple has not chosen yet, so the
  // payment screen sends them back to choose first.
  'help-choose': {
    name: 'Help Me Choose',
    description: 'We will help you choose the right agreement before you pay.',
    amount: 0,
  },
};

export function isPayableAgreementType(value?: string | null): value is AgreementTypeId {
  return (
    typeof value === 'string' &&
    value in SERVICE_PRICING &&
    SERVICE_PRICING[value as AgreementTypeId].amount > 0
  );
}

export function priceFor(agreementType?: string | null): ServicePrice | null {
  if (typeof agreementType !== 'string') return null;
  return SERVICE_PRICING[agreementType as AgreementTypeId] ?? null;
}

// "£499.00"
export function formatGbp(amount: number): string {
  return `£${amount.toFixed(2)}`;
}
