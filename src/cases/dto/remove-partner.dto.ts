import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RemovePartnerDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
