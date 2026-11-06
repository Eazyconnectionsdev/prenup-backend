// update-partner-profile.dto.ts
import {
  IsOptional,
  IsString,
  IsDateString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { IsValidPhone } from '../../common/is-valid-phone.decorator';

/**
 * Details the logged-in user may edit on the partner they are linked to
 * (their `invitedUser`, or the `invitedBy` owner when they are user2).
 *
 * Deliberately narrower than UpdateUserProfileDto: the partner's email is the
 * identity on their own login and `marketingConsent` is their own consent, so
 * neither can be changed from here.
 */
export class UpdatePartnerProfileDto {
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
  @IsValidPhone()
  phone?: string;
}
