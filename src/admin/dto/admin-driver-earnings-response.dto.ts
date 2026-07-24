import { DriverEarningStatus, DriverPayoutState } from '@prisma/client';

export type AdminDriverEarningsView =
  | 'all'
  | 'pending'
  | 'active'
  | 'failed'
  | 'paid';

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

export interface AdminDriverAdditionalChargePaymentMethodDto {
  id: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
}

export interface AdminDriverAdditionalChargeDto {
  id: string;
  amount: number;
  appFeeAmount: number;
  totalChargeAmount: number;
  currency: string;
  status: string;
  paymentOption: 'SAVED_CARD' | 'CASH_ON_DELIVERY' | null;
  savedPaymentMethod: AdminDriverAdditionalChargePaymentMethodDto | null;
  createdAt: string;
}

export interface AdminDriverEarningItemDto {
  tripId: string;
  earningId: string;
  settlementId: string;
  driver: AdminDriverEarningPartyDto;
  customer: AdminDriverEarningPartyDto;
  stripe: AdminDriverStripeStatusDto;
  grossAmount: number;
  platformFeeAmount: number;
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
  additionalCharges: AdminDriverAdditionalChargeDto[];
}

export interface AdminDriverEarningsListResponseDto {
  items: AdminDriverEarningItemDto[];
  total: number;
  summary: AdminDriverEarningSummaryDto;
}
