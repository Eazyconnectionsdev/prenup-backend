import {
  IsString,
} from 'class-validator';

export class CompareVersionDto {
  @IsString()
  from!: string;

  @IsString()
  to!: string;
}