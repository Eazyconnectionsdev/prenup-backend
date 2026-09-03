import {
  IsEmail,
  IsOptional,
  IsString,
} from 'class-validator';

export class InvitePartnerDto {
  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  mobileNumber?: string;

  @IsOptional()
  @IsString()
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