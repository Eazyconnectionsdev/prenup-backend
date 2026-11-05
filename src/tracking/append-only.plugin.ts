// Audit records are written once and never changed or removed through the
// application. Retention is handled by MongoDB TTL indexes, which run inside
// the database and are not affected by these hooks.

import { Schema } from 'mongoose';

const BLOCKED_QUERY_OPS = [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'replaceOne',
  'findOneAndReplace',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
] as const;

export function appendOnlyPlugin(schema: Schema) {
  for (const op of BLOCKED_QUERY_OPS) {
    schema.pre(op as any, function () {
      throw new Error('Audit records are append-only and cannot be changed');
    });
  }
  schema.pre('save', function () {
    if (!this.isNew) {
      throw new Error('Audit records are append-only and cannot be changed');
    }
  });
  schema.pre('deleteOne', { document: true, query: false }, function () {
    throw new Error('Audit records are append-only and cannot be deleted');
  });
}

export const retentionSeconds = (envKey: string, defaultDays: number) => {
  const days = Number(process.env[envKey]);
  return Math.round((Number.isFinite(days) && days > 0 ? days : defaultDays) * 86400);
};
