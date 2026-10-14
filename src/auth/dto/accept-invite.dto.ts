import {
  IsEmail,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsValidPhone } from '../../common/is-valid-phone.decorator';

export class AcceptInviteDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsMongoId()
  caseId: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(72, { message: 'Password must be at most 72 characters' })
  password: string;

  // Optional overrides: the partner may register with their own details.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  firstName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  lastName?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsValidPhone()
  phone?: string;
}
