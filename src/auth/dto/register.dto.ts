// src/auth/dto/register.dto.ts
import { IsEmail, IsString, IsOptional, IsBoolean, IsNotEmpty, Matches, IsDateString } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  // Split name fields
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  middleName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  // Suffix (e.g., Jr., Sr., III)
  @IsOptional()
  @IsString()
  suffix?: string;

  // Date of Birth
  @IsOptional()
  @IsDateString({}, { message: 'dateOfBirth must be a valid ISO date string' })
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  endUserType?: string;

  // Optional phone — basic international format check
  @IsOptional()
  @Matches(/^\+?[0-9]{7,15}$/, {
    message: 'phone must be digits, optional leading +, length between 7 and 15',
  })
  phone?: string;

  // Optional marketing/news checkbox
  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;

  // Must be present and true in request
  @IsBoolean()
  acceptedTerms: boolean;
}
