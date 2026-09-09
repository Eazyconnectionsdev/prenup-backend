import {
  IsObject,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateVersionDto {
  @IsObject()
  previousVersion: any;

  @IsObject()
  updatedVersion: any;

  @IsString()
  @MinLength(5)
  changeReason!: string;
}