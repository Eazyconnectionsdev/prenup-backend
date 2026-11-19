import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';
import { IsValidPhone } from '../../common/is-valid-phone.decorator';

export class InvitePartnerDto {
  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @IsValidPhone()
  mobileNumber?: string;

  // Same values the Case schema allows (partnerInviteDetails.relationshipStatus);
  // anything else used to reach the save and fail there as a 500.
  @IsOptional()
  @IsIn(['Fiancé', 'Fiancée', 'Partner', '', null], {
    message: 'relationshipStatus must be Fiancé, Fiancée or Partner',
  })
  relationshipStatus?: string;

  @IsOptional()
  @IsString()
  targetWeddingDate?: Date;

  @IsOptional()
  @IsString()
  personalMessage?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  sentTimestamp?: string;
}