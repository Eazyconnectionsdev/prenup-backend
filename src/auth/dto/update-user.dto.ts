import { IsEmail, IsOptional, IsString } from "class-validator";

export class UpdateUserDto {
  // User details
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  middleName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  suffix?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  // Fiancé details
  @IsOptional()
  @IsString()
  fianceFirstName?: string;

  @IsOptional()
  @IsString()
  fianceMiddleName?: string;

  @IsOptional()
  @IsString()
  fianceLastName?: string;

  @IsOptional()
  @IsString()
  fianceSuffix?: string;

  @IsOptional()
  @IsEmail()
  fianceEmail?: string;

  @IsOptional()
  @IsString()
  fianceDateOfBirth?: string;
}