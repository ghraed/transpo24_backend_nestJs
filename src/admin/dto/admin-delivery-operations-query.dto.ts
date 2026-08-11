import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class AdminDeliveryOperationsQueryDto {
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
  @IsIn(['all', 'active', 'unassigned', 'completed', 'cancelled'])
  view?: 'all' | 'active' | 'unassigned' | 'completed' | 'cancelled' = 'all';

  @IsOptional()
  @IsString()
  search?: string;
}
