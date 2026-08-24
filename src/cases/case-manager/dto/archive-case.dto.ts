import {
  IsOptional,
  IsString,
} from 'class-validator';

export class ArchiveCaseDto {
  @IsOptional()
  @IsString()
  reason?: string;
}