import {
  IsString,
} from 'class-validator';

export class CompareAgreementDto {
  @IsString()
  left!: string;

  @IsString()
  right!: string;
}