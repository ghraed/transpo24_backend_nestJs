import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

import type { AdminPaymentDisputeRecordType } from './admin-payment-disputes-response.dto';

export class AdminPaymentDisputesQueryDto {
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
  @IsIn(['TRIP_CHARGE', 'WALLET_TOP_UP'])
  recordType?: AdminPaymentDisputeRecordType;

  @IsOptional()
  @IsIn(['open', 'closed', 'manual_review'])
  view?: 'open' | 'closed' | 'manual_review' = 'open';
}
