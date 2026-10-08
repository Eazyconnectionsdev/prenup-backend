import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class AddCompanyNoteDto {
  @IsString()
  @IsNotEmpty()
  content: string;
}

export class AddLawyerNoteDto {
  @IsString()
  @IsNotEmpty()
  content: string;
}
