import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AdminSettingsDocument = AdminSettings & Document;

/**
 * AdminSettings – a singleton document (only one ever created/used).
 *
 * Section 1: TopBar toggles (enable/disable + visual toggle state)
 * Section 2: (Lawyer Company & Lawyer creation are handled via Company/Lawyer
 *             controllers – the schema covers the config/feature-flag layer)
 */
@Schema({ timestamps: true })
export class AdminSettings {
  // ---- Section 1: TopBar 1 ----
  @Prop({ default: true })
  topBar1Enabled: boolean; // Enable / Disable

  @Prop({ default: false })
  topBar1Toggle: boolean; // visual Toggle state

  // ---- Section 1: TopBar 2 ----
  @Prop({ default: true })
  topBar2Enabled: boolean; // Enable / Disable

  @Prop({ default: false })
  topBar2Toggle: boolean; // visual Toggle state

  // ---- Meta ----
  @Prop({ default: 'singleton' })
  key: string; // always "singleton" – enforces one document via unique index
}

export const AdminSettingsSchema = SchemaFactory.createForClass(AdminSettings);
AdminSettingsSchema.index({ key: 1 }, { unique: true });
