// src/auth/dto/register.dto.ts
import {
  IsEmail,
  IsString,
  IsOptional,
  IsBoolean,
  IsNotEmpty,
  IsDateString,
  MaxLength,
  MinLength,
  Equals,
} from 'class-validator';
import { IsValidPhone } from '../../common/is-valid-phone.decorator';

export class RegisterDto {
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254)
  email: string;

  // bcrypt ignores everything past 72 bytes, so cap it there.
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(72, { message: 'Password must be at most 72 characters' })
  password: string;

  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  @MaxLength(50)
  firstName: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  middleName?: string;

  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  @MaxLength(50)
  lastName: string;

  // Suffix (e.g., Jr., Sr., III)
  @IsOptional()
  @IsString()
  @MaxLength(10)
  suffix?: string;

  // Date of Birth
  @IsOptional()
  @IsDateString({}, { message: 'dateOfBirth must be a valid ISO date string' })
  dateOfBirth?: string;

  // `role` and `endUserType` are deliberately NOT accepted here: public
  // registration always creates an end_user / user1 (see AuthService).

  @IsOptional()
  @IsValidPhone()
  phone?: string;

  // Optional marketing/news checkbox
  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;

  @Equals(true, { message: 'You must accept the Terms & Conditions and Privacy Policy' })
  acceptedTerms: boolean;
}
