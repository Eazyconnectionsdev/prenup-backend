import {
  IsString,
  MinLength,
} from 'class-validator';

export class VersionCommentDto {
  @IsString()
  @MinLength(3)
  beforeValue!: string;

  @IsString()
  @MinLength(3)
  afterValue!: string;

  @IsString()
  @MinLength(5)
  reason!: string;
}