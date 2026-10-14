import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// ─── TopBar Item ─────────────────────────────────────────────────────────────

@Schema({ _id: false })
export class TopBarItem {
  /** Unique key identifying this topbar element, e.g. "topBar1", "topBar2" */
  @Prop({ type: String, required: true })
  key!: string;

  /** Display label for the element, e.g. "TopBar-1 Navigation" */
  @Prop({ type: String, default: '' })
  element!: string;

  /** Whether this item is enabled/disabled in the topbar */
  @Prop({ type: Boolean, default: false })
  enabled!: boolean;

  /** The text string displayed inside the topbar for this element */
  @Prop({ type: String, default: '' })
  text!: string;
}

// ─── Site Settings (singleton document) ──────────────────────────────────────

export type SettingsDocument = Settings & Document;

@Schema({ timestamps: true, collection: 'site_settings' })
export class Settings {
  /**
   * Always set to 1 so there is only ever one document in the collection.
   * Use findOneAndUpdate({ singleton: 1 }, ..., { upsert: true }) everywhere.
   */
  @Prop({ type: Number, default: 1, unique: true })
  singleton!: number;

  @Prop({ type: Boolean, default: true })
  topBar1Enabled!: boolean;

  @Prop({ type: String, default: '' })
  topBar1Text!: string;

  @Prop({ type: Boolean, default: true })
  topBar2Enabled!: boolean;

  @Prop({ type: String, default: '' })
  topBar2Text!: string;

  /** TopBar configuration list */
  @Prop({
    type: [
      {
        key:     { type: String, required: true },
        element: { type: String, default: '' },
        enabled: { type: Boolean, default: false },
        text:    { type: String, default: '' },
      },
    ],
    default: [],
  })
  topBar!: TopBarItem[];
}

export const SettingsSchema = SchemaFactory.createForClass(Settings);
