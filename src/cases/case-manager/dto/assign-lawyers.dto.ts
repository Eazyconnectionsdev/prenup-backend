import {
  IsMongoId,
  IsOptional,
  IsString,
} from 'class-validator';

export class AssignLawyersDto {
  @IsMongoId()
  p1LawyerId!: string;

  @IsMongoId()
  p2LawyerId!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}