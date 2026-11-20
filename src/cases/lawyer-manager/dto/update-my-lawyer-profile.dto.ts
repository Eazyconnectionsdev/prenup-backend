import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsValidPhone } from '../../../common/is-valid-phone.decorator';

/**
 * What a lawyer may change on their own profile. The firm they belong to,
 * their availability, account status, verification and internal notes stay
 * with the admin team (PATCH /admin/lawyers/:id).
 */
export class UpdateMyLawyerProfileDto {
  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  @MaxLength(50)
  firstName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  middleName?: string;

  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  @MaxLength(50)
  lastName!: string;

  @IsString()
  @IsNotEmpty({ message: 'Job title is required' })
  @MaxLength(120)
  jobTitle!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  officeBranch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  regulatoryBody?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  practisingStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  jurisdiction?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  qualifications?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  priceText?: string;

  // Also the address the lawyer signs in with.
  @IsEmail({}, { message: 'Enter a valid work email' })
  @MaxLength(254)
  workEmail!: string;

  @IsOptional()
  @IsString()
  @IsValidPhone()
  workPhone?: string;

  @IsOptional()
  @IsString()
  @IsValidPhone()
  mobilePhone?: string;

  // Needed only when the sign-in (work) email changes.
  @IsOptional()
  @IsString()
  @MaxLength(72)
  currentPassword?: string;
}

export class ChangeMyPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Enter your current password' })
  @MaxLength(72)
  currentPassword!: string;

  // bcrypt ignores everything past 72 bytes, so cap it there (as on sign-up).
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(72, { message: 'Password must be at most 72 characters' })
  newPassword!: string;
}
