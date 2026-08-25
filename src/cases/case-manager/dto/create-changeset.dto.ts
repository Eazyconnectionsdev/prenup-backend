import {
  IsArray,
} from 'class-validator';

export class ChangeItemDto {
  section!: string;

  field!: string;

  previousValue: any;

  newValue: any;

  action!:
    | 'ADDED'
    | 'REMOVED'
    | 'CHANGED';
}

export class CreateChangeSetDto {
  @IsArray()
  changes!: ChangeItemDto[];
}