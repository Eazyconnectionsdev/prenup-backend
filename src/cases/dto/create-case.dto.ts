import { IsOptional, IsString } from 'class-validator';

export class CreateCaseDto {
  @IsOptional()
  @IsString()
  title?: string;
}
