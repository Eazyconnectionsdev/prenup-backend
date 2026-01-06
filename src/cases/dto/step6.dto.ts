// src/cases/dto/step6.dto.ts
import { Type, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class FutureInheritanceDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'originalAmount must be a number' })
  originalAmount?: number | null;

  @IsOptional()
  @IsString()
  originalCurrency?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'gbpEquivalent must be a number' })
  gbpEquivalent?: number | null;

  @IsOptional()
  @IsString()
  basisOfEstimate?: string | null;
}

export class Step6Dto {
  // Coerce incoming values to boolean using Type(() => Boolean).
  // This handles true/false booleans and "true"/"false" string values.
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'inheritanceSeparate must be a boolean value' })
  inheritanceSeparate?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'giftsSeparate must be a boolean value' })
  giftsSeparate?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'futureSoleAssetsSeparate must be a boolean value' })
  futureSoleAssetsSeparate?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'sameAsWill must be a boolean value' })
  sameAsWill?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'wantWillAssistance must be a boolean value' })
  wantWillAssistance?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => FutureInheritanceDto)
  sooriyaFutureInheritance?: FutureInheritanceDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => FutureInheritanceDto)
  gomathiFutureInheritance?: FutureInheritanceDto | null;
}
