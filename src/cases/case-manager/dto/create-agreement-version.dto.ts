import {
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateAgreementVersionDto {
  @IsOptional()
  @IsString()
  versionName?: string;

  @IsOptional()
  @IsString()
  comments?: string;
}