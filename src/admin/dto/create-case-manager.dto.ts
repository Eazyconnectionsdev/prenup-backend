
import { IsString, IsNotEmpty, IsEmail, MinLength, IsOptional } from 'class-validator';
import { IsValidPhone } from '../../common/is-valid-phone.decorator';

export class CreateCaseManagerDto {
  /** Login email for the case manager user account */
  @IsEmail()
  @IsNotEmpty()
  email: string;

  /** Plaintext password — will be hashed before storage */
  @IsString()
  @MinLength(8)
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  @IsValidPhone()
  phone?: string;

  @IsOptional()
  jurisdiction?: any;

  @IsOptional()
  primaryJurisdiction?: any;
}

