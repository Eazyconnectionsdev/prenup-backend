// update-user-profile.dto.ts
import {
  IsOptional,
  IsString,
  IsDateString,
  IsBoolean,
  MaxLength,
  Matches,
  ValidateIf,
} from 'class-validator';

export class UpdateUserProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  middleName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  suffix?: string;

  // null clears the date
  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^$|^\+?[0-9\s\-()]{7,20}$/, {
    message: 'phone must be a valid phone number',
  })
  phone?: string;

  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;
}
