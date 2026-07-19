import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

import type { AdminDriverEarningsView } from './admin-driver-earnings-response.dto';

export class AdminDriverEarningsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsIn(['all', 'pending', 'active', 'failed'])
  view?: AdminDriverEarningsView = 'all';
}
