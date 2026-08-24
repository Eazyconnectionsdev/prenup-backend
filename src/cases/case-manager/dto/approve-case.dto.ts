import {
  IsBoolean,
  IsOptional,
  IsString,
} from 'class-validator';

export class ApproveCaseDto {
  @IsOptional()
  @IsString()
  comments?: string;

  @IsOptional()
  @IsBoolean()
  notifyClients?: true;
}