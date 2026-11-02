import { applyDecorators } from '@nestjs/common';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { IsValidPhone } from '../../common/is-valid-phone.decorator';
import { COMPANY_STATUSES, COMPANY_TYPES } from '../schemas/company.schema';

/** A required string: present, not just whitespace, and not absurdly long. */
export function RequiredText(max = 200) {
  return applyDecorators(
    IsString(),
    Matches(/\S/, { message: ({ property }) => `${property} should not be empty` }),
    MaxLength(max),
  );
}

/** Used for both creating and editing a company (edit sends the full form). */
export class CreateCompanyDto {
  // ── A. Company details ─────────────────────────────────────────────────────
  @RequiredText()
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  companyNumber?: string;

  @IsIn(COMPANY_TYPES as readonly string[])
  companyType: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  regulatoryBody?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  regulatoryNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  vatNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsIn(COMPANY_STATUSES as readonly string[])
  status: string;

  // ── B. Contact details ─────────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  @MaxLength(100)
  contactFirstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  contactLastName?: string;

  @IsEmail()
  @MaxLength(254)
  email: string;

  @RequiredText(30)
  @IsValidPhone()
  phone: string;

  // ── C. Registered address ──────────────────────────────────────────────────
  @RequiredText()
  addressLine1: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @RequiredText(100)
  city: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  county?: string;

  @RequiredText(20)
  postcode: string;

  @RequiredText(100)
  country: string;

  // ── E. Internal administration ─────────────────────────────────────────────
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;
}
