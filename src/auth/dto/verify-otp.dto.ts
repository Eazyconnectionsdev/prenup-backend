// src/auth/dto/verify-otp.dto.ts
import { IsEmail, IsNotEmpty, IsString, Length, Matches } from 'class-validator';

/**
 * Payload for verifying an OTP sent to user's email.
 * - email: must be a valid email
 * - otp: numeric string (digits only). Length restriction chosen to be flexible (4-10).
 */
export class VerifyOtpDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+$/, { message: 'OTP must contain digits only' })
  @Length(4, 10, { message: 'OTP length must be between 4 and 10 characters' })
  otp: string;
}
