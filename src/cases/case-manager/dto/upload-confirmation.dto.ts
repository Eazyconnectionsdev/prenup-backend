import {
  IsOptional,
  IsString,
} from 'class-validator';

export class UploadConfirmationDto {
  @IsOptional()
  @IsString()
  comments?: string;
}