import { IsIn, IsOptional } from 'class-validator';

import type { AdminPaymentReconciliationStream } from './admin-payment-reconciliation-response.dto';

export class RunPaymentReconciliationDto {
  @IsOptional()
  @IsIn(['all', 'wallet', 'captures', 'refunds', 'transfers'])
  stream?: AdminPaymentReconciliationStream = 'all';
}
