import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

import type {
  AdminPaymentReconciliationStatus,
  AdminPaymentReconciliationStream,
} from './admin-payment-reconciliation-response.dto';

export class AdminPaymentReconciliationQueryDto {
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
  @IsIn(['all', 'wallet', 'captures', 'refunds', 'transfers'])
  stream?: AdminPaymentReconciliationStream = 'all';

  @IsOptional()
  @IsIn(['all', 'matched', 'mismatch', 'missing', 'failed'])
  status?: AdminPaymentReconciliationStatus = 'all';
}
