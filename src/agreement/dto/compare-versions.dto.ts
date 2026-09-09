import { IsMongoId } from 'class-validator';

export class CompareVersionsDto {
  @IsMongoId()
  versionA!: string;

  @IsMongoId()
  versionB!: string;
}