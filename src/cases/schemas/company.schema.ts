import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { StoredFile, StoredFileSchema } from '../../common/schemas/stored-file.schema';

export type CompanyDocument = Company & Document;

export const COMPANY_TYPES = [
  'Limited company',
  'LLP',
  'Partnership',
  'Sole practitioner',
  'Alternative business structure (ABS)',
  'Other',
] as const;

export const COMPANY_STATUSES = ['active', 'inactive'] as const;

export const COMPANY_FILE_CATEGORIES = [
  'Regulatory certificate',
  'Professional indemnity insurance',
  'Company registration',
  'Terms of business',
  'Fee schedule',
  'Compliance / AML policy',
  'Contract / agreement',
  'Identification',
  'Other',
] as const;

@Schema({ timestamps: true })
export class Company {
  // ── A. Company details ─────────────────────────────────────────────────────
  @Prop({ required: true })
  name!: string;

  @Prop()
  companyNumber?: string;

  @Prop({ type: String, enum: COMPANY_TYPES })
  companyType?: string;

  /** SRA or another regulatory body. */
  @Prop()
  regulatoryBody?: string;

  @Prop()
  regulatoryNumber?: string;

  @Prop()
  vatNumber?: string;

  @Prop()
  website?: string;

  @Prop()
  description?: string;

  // Older records have no status; treat a missing value as active.
  @Prop({ type: String, enum: COMPANY_STATUSES, default: 'active' })
  status?: string;

  // ── B. Contact details ─────────────────────────────────────────────────────
  @Prop()
  contactFirstName?: string;

  @Prop()
  contactLastName?: string;

  /** Main contact email. */
  @Prop()
  email?: string;

  /** Main contact phone number. */
  @Prop()
  phone?: string;

  // ── C. Registered address ──────────────────────────────────────────────────
  @Prop()
  addressLine1?: string;

  @Prop()
  addressLine2?: string;

  @Prop()
  city?: string;

  @Prop()
  county?: string;

  @Prop()
  postcode?: string;

  @Prop()
  country?: string;

  /** One-line summary of the address above (kept for older records and consumers). */
  @Prop()
  address?: string;

  // ── D. Documents ───────────────────────────────────────────────────────────
  @Prop({ type: [StoredFileSchema], default: [] })
  documents?: StoredFile[];

  // ── E. Internal administration ─────────────────────────────────────────────
  /** Internal notes. */
  @Prop()
  notes?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop()
  photoUrl?: string;

  @Prop({ default: false })
  verified?: boolean;
}

export const CompanySchema = SchemaFactory.createForClass(Company);
