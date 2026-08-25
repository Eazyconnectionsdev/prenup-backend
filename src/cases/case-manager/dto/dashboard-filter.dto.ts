import {
  IsEnum,
  IsOptional,
} from 'class-validator';

import { CasePriority } from './update-priority.dto';

export class DashboardFilterDto {
  @IsOptional()
  @IsEnum(CasePriority)
  priority?: CasePriority;

  @IsOptional()
  status?: string;

  @IsOptional()
  stage?: string;
}