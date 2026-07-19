import { DriverEarningStatus, DriverPayoutState } from '@prisma/client';

export type AdminDriverEarningsView = 'all' | 'pending' | 'active' | 'failed';

export interface AdminDriverEarningPartyDto {
  id: string;
  userId?: string;
  name: string;
  email: string;
}

export interface AdminDriverStripeStatusDto {
  accountId: string | null;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
}

export interface AdminDriverEarningSummaryDto {
  pendingCount: number;
  activeCount: number;
  failedCount: number;
}

export interface AdminDriverEarningItemDto {
  tripId: string;
  earningId: string;
  settlementId: string;
  driver: AdminDriverEarningPartyDto;
  customer: AdminDriverEarningPartyDto;
  stripe: AdminDriverStripeStatusDto;
  netAmount: number;
  currency: string;
  earningStatus: DriverEarningStatus;
  availableAt: string | null;
  paidOutAt: string | null;
  driverPayoutState: DriverPayoutState;
  payoutAttemptCount: number;
  lastPayoutAttemptAt: string | null;
  nextPayoutRetryAt: string | null;
  payoutFailureReason: string | null;
  stripeTransferId: string | null;
  stripeTransferStatus: string | null;
  canRetry: boolean;
  retryBlockedReason: string | null;
}

export interface AdminDriverEarningsListResponseDto {
  items: AdminDriverEarningItemDto[];
  total: number;
  summary: AdminDriverEarningSummaryDto;
}
