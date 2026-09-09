import {
  IsEnum,
  IsString,
  MinLength,
} from 'class-validator';

export enum NoteCategory {
  OPERATIONAL = 'OPERATIONAL',
  CLARIFICATION = 'CLARIFICATION',
  ESCALATION = 'ESCALATION',
  RISK = 'RISK',
  COMPLAINT = 'COMPLAINT',
}

export class CreateNoteDto {
  @IsEnum(NoteCategory)
  category!: NoteCategory;

  @IsString()
  @MinLength(3)
  note!: string;
}