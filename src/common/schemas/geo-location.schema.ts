// src/common/schemas/geo-location.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/**
 * Embedded sub-document for a resolved geo-location.
 * Stored directly inside User (no separate collection).
 */
@Schema({ _id: false })
export class GeoLocationSchema {
  @Prop({ type: String, default: null })
  country?: string | null;

  @Prop({ type: String, default: null })
  region?: string | null;

  @Prop({ type: String, default: null })
  city?: string | null;

  /** [latitude, longitude] */
  @Prop({ type: [Number], default: null })
  ll?: number[] | null;

  @Prop({ type: String, default: null })
  postal?: string | null;

  @Prop({ type: String, default: null })
  timezone?: string | null;

  @Prop({ type: Number, default: null })
  geonameId?: number | null;

  /** Raw API response kept for debugging / future enrichment */
  @Prop({ type: Object, default: null })
  raw?: any;
}

export const GeoLocationMongoSchema = SchemaFactory.createForClass(GeoLocationSchema);

