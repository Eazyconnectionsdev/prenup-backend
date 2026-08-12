
import { IsString, IsNotEmpty, IsOptional, IsMongoId } from 'class-validator';

export class CreateLawyerDto {
  @IsString()
  @IsNotEmpty()
  externalId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  priceText?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsString()
  @IsNotEmpty()
  @IsMongoId()
  company: string; // company ObjectId (string form) - will be converted in service

  @IsOptional()
  @IsString()
  publicEmail?: string;

  @IsOptional()
  @IsString()
  publicPhone?: string;

  @IsOptional()
  @IsString()
  directEmail?: string;

  @IsOptional()
  @IsString()
  directPhone?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  profileLink?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  barNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}