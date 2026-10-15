
import { IsString, IsNotEmpty, IsOptional, IsMongoId, IsEmail, MinLength } from 'class-validator';
import { IsValidPhone } from '../../common/is-valid-phone.decorator';

export class CreateLawyerDto {
  @IsOptional()
  @IsString()
  externalId?: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  priceText?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsString()
  @IsNotEmpty()
  @IsMongoId()
  company: string; // company ObjectId (string form) - will be converted in service

  // ── Login account fields (creates a User with role=lawyer) ──────────────────
  /** The email address the lawyer will use to log in. Required to create a login account. */
  @IsEmail()
  @IsNotEmpty()
  loginEmail: string;

  /** Plaintext password for the lawyer login. Will be hashed before storage. */
  @IsString()
  @MinLength(8)
  @IsNotEmpty()
  password: string;

  @IsOptional()
  @IsString()
  publicEmail?: string;

  @IsOptional()
  @IsString()
  @IsValidPhone()
  publicPhone?: string;

  @IsOptional()
  @IsString()
  directEmail?: string;

  @IsOptional()
  @IsString()
  @IsValidPhone()
  directPhone?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  profileLink?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  barNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}