// src/auth/dto/register.dto.ts
import { IsEmail, IsString, IsOptional, IsBoolean, IsNotEmpty, Matches } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  endUserType?: string;

  // Optional phone — basic international format check (accepts + and digits, length 7-15)
  @IsOptional()
  @Matches(/^\+?[0-9]{7,15}$/, {
    message: 'phone must be digits, optional leading +, length between 7 and 15',
  })
  phone?: string;

  // Optional marketing/news checkbox
  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;

  // Must be present and true in request (we'll do a server-side check too)
  @IsBoolean()
  acceptedTerms: boolean;
}
