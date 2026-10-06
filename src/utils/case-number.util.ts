// src/utils/case-number.util.ts
import { Model } from 'mongoose';

/**
 * Atomically increments a sequence counter and returns the next value.
 * Uses MongoDB findOneAndUpdate with upsert so it is safe under concurrency.
 */
export async function getNextSeq(
  counterModel: Model<any>,
  name: string,
): Promise<number> {
  const doc = await counterModel
    .findOneAndUpdate(
      { _id: name },
      { $inc: { seq: 1 } },
      { new: true, upsert: true },
    )
    .lean()
    .exec();
  return (doc as any).seq as number;
}

/**
 * Generates a formatted case number.
 * Format: CASE-YYYY-NNNNN (e.g. CASE-2026-00001)
 */
export async function generateCaseNumber(
  counterModel: Model<any>,
): Promise<string> {
  const year = new Date().getFullYear();
  const counterKey = `case-${year}`;
  const seq = await getNextSeq(counterModel, counterKey);
  return `CASE-${year}-${String(seq).padStart(5, '0')}`;
}

/**
 * Returns the display case ID for a case document.
 * Falls back to the MongoDB _id string if caseNumber is not yet set.
 */
export function getDisplayCaseId(caseDoc: any): string {
  return (
    caseDoc?.caseNumber ??
    caseDoc?._id?.toString() ??
    caseDoc?.id?.toString() ??
    'N/A'
  );
}
