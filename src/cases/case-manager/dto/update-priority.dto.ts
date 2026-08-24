import {
  IsEnum,
} from 'class-validator';

export enum CasePriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export class UpdatePriorityDto {
  @IsEnum(CasePriority)
  priority!: CasePriority;
}