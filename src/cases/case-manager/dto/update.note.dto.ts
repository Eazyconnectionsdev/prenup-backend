import {
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

import { NoteCategory } from './create-note.dto';

export class UpdateNoteDto {
  @IsOptional()
  @IsEnum(NoteCategory)
  category?: NoteCategory;

  @IsOptional()
  @IsString()
  note?: string;
}