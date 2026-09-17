// src/agreement/dto/check-in-version.dto.ts

import {
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

// Payload for checking in a lawyer's edited copy of the current document
// (bumps minorVersion only, majorVersion stays the same)
export class CheckInVersionDto {
  @IsMongoId()
  checkedInBy: string; // userId — prefer pulling this from the auth guard instead of trusting the body

  @IsString()
  @IsNotEmpty()
  s3Bucket: string;

  @IsString()
  @IsNotEmpty()
  s3Key: string;

  @IsString()
  @IsNotEmpty()
  originalFileName: string;

  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @IsNumber()
  fileSizeBytes: number;

  @IsString()
  @IsNotEmpty()
  checksum: string;

  @IsOptional()
  @IsString()
  changeNotes?: string;
}