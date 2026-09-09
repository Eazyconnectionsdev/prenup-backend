// src/agreement/dto/generate-version.dto.ts

import { IsMongoId, IsNotEmpty, IsNumber, IsString } from 'class-validator';

// Payload for creating a fresh document generated from case/questionnaire
// data (bumps majorVersion, resets minorVersion to 1)
export class GenerateVersionDto {
  @IsMongoId()
  generatedBy: string; // userId — prefer pulling this from the auth guard instead of trusting the body

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
}