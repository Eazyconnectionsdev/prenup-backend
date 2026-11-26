import { BadRequestException } from '@nestjs/common';

/**
 * How close the planned wedding / civil partnership is, which decides whether
 * the couple can carry on with the standard online prenup process.
 *
 *  - more than 35 days away  -> STANDARD            (no warning)
 *  - 29 to 35 days away      -> TIGHT_TIMELINE_ACK  (allowed once the risk is acknowledged)
 *  - 28 days or fewer        -> UNDER_28_DAYS_BLOCKED (self-service save refused)
 *
 * English family law guidance recommends the agreement is signed at least 28
 * days before the ceremony. The same thresholds are applied in the browser
 * (prenup/lib/ceremonyTiming.ts); this copy is the one that is enforced.
 */
export type CeremonyTimingStatus =
  | 'STANDARD'
  | 'TIGHT_TIMELINE_ACK'
  | 'UNDER_28_DAYS_BLOCKED';

export const CEREMONY_BLOCK_DAYS = 28;
export const CEREMONY_WARNING_DAYS = 35;

// Days are counted on the UK calendar so the threshold flips at UK midnight,
// whatever timezone the server runs in.
function todayInLondon(): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

/** Whole calendar days from today (UK) to the given YYYY-MM-DD date. */
export function daysUntilCeremony(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const target = Date.UTC(+match[1], +match[2] - 1, +match[3]);
  if (Number.isNaN(target)) return null;
  const t = todayInLondon();
  const today = Date.UTC(t.y, t.m - 1, t.d);
  return Math.round((target - today) / 86_400_000);
}

export function ceremonyTimingStatus(
  value: unknown,
): CeremonyTimingStatus | null {
  const days = daysUntilCeremony(value);
  if (days === null) return null;
  // A date already passed is also inside the window: the couple is married.
  if (days <= CEREMONY_BLOCK_DAYS) return 'UNDER_28_DAYS_BLOCKED';
  if (days <= CEREMONY_WARNING_DAYS) return 'TIGHT_TIMELINE_ACK';
  return 'STANDARD';
}

export const CEREMONY_BLOCKED_MESSAGE =
  'Your planned wedding or civil partnership date is within 28 days. ' +
  'We cannot proceed with our standard online prenup process for this date. ' +
  'Please contact our team to discuss your circumstances and the options available.';

/**
 * Checks a personal-information payload and stamps the timing status on it.
 *
 * The couple (self-service) cannot save a date inside the 28-day window, and a
 * date 29-35 days away needs the risk acknowledgement ticked. Staff (case
 * manager / admin) may still save so they can correct a case, but the status is
 * recorded either way so the case can be prioritised.
 */
export function applyCeremonyTiming(
  data: Record<string, any>,
  isPrivileged: boolean,
): Record<string, any> {
  const status = ceremonyTimingStatus(data?.marriageDate);
  const next: Record<string, any> = { ...data, ceremonyTimingStatus: status };

  if (status !== 'TIGHT_TIMELINE_ACK') {
    // The acknowledgement only means something for the 29-35 day window.
    next.ceremonyTimingAcknowledged = false;
    next.ceremonyTimingAcknowledgedAt = null;
  }

  if (isPrivileged) return next;

  if (status === 'UNDER_28_DAYS_BLOCKED') {
    throw new BadRequestException({
      message: CEREMONY_BLOCKED_MESSAGE,
      code: 'UNDER_28_DAYS_BLOCKED',
    });
  }

  if (status === 'TIGHT_TIMELINE_ACK') {
    if (data?.ceremonyTimingAcknowledged !== true) {
      throw new BadRequestException({
        message:
          'Your wedding or civil partnership is 29 to 35 days away. Please tick the timing acknowledgement to continue.',
        code: 'TIGHT_TIMELINE_ACK_REQUIRED',
      });
    }
    next.ceremonyTimingAcknowledgedAt =
      data?.ceremonyTimingAcknowledgedAt || new Date().toISOString();
  }

  return next;
}
