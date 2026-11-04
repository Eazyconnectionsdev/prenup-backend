import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { IsValidPhone } from '../../common/is-valid-phone.decorator';
import { LAWYER_PRACTISING_STATUSES, LAWYER_STATUSES } from '../schemas/lawyer.schema';
import { RequiredText } from './create-company.dto';

// A blank <select> or password box arrives as an empty string.
const isFilled = (_: unknown, value: unknown) => value !== undefined && value !== null && value !== '';

/**
 * Used for both creating and editing a lawyer (edit sends the full form).
 * The password is required to create an account; on edit, leaving it blank
 * keeps the current one (the service enforces that rule).
 */
export class CreateLawyerDto {
  // ── A. Personal details ────────────────────────────────────────────────────
  @RequiredText(100)
  firstName: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  middleName?: string;

  @RequiredText(100)
  lastName: string;

  // ── B. Company association and role ────────────────────────────────────────
  @IsMongoId()
  company: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  officeBranch?: string;

  @RequiredText(150)
  jobTitle: string;

  @IsIn(LAWYER_STATUSES as readonly string[])
  lawyerStatus: string;

  // ── C. Professional details ────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  @MaxLength(200)
  regulatoryBody?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  registrationNumber?: string;

  @ValidateIf(isFilled)
  @IsIn(LAWYER_PRACTISING_STATUSES as readonly string[])
  practisingStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  jurisdiction?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  qualifications?: string;

  /** Shown to clients in the "lawyer assigned" email. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  priceText?: string;

  // ── D. Contact details ─────────────────────────────────────────────────────
  @IsEmail()
  @MaxLength(254)
  workEmail: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  @IsValidPhone()
  workPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  @IsValidPhone()
  mobilePhone?: string;

  // ── E. Portal account ──────────────────────────────────────────────────────
  @IsIn(LAWYER_STATUSES as readonly string[])
  accountStatus: string;

  @IsOptional()
  @IsBoolean()
  sendWelcomeEmail?: boolean;

  @ValidateIf(isFilled)
  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt ignores everything past 72 bytes
  password?: string;

  // ── G. Internal administration ─────────────────────────────────────────────
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  internalNotes?: string;
}
