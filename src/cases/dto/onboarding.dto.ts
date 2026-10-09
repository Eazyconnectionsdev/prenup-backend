import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SaveOnboardingDto {
  @IsString()
  @IsNotEmpty()
  agreementType!: string;

  @IsOptional()
  @IsBoolean()
  residesInUK?: boolean;

  @IsOptional()
  @IsBoolean()
  understandsService?: boolean;
}

