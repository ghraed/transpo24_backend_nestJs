import {
  CustomerWalletTopUpStatus,
  DriverPayoutState,
  TripPaymentSettlementStatus,
} from '@prisma/client';

export type AdminPaymentDisputeRecordType = 'TRIP_CHARGE' | 'WALLET_TOP_UP';

export interface AdminPaymentDisputePartyDto {
  id: string;
  userId?: string;
  name: string;
  email: string;
}

export interface AdminPaymentDisputeSummaryDto {
  openCount: number;
  closedCount: number;
  manualReviewCount: number;
}

export interface AdminPaymentDisputeItemDto {
  id: string;
  recordType: AdminPaymentDisputeRecordType;
  paymentStatus: TripPaymentSettlementStatus | CustomerWalletTopUpStatus;
  disputeStatus: string | null;
  stripeDisputeId: string | null;
  stripeChargeId: string | null;
  stripePaymentIntentId: string | null;
  amount: number;
  currency: string;
  disputeAmount: number | null;
  disputeCurrency: string | null;
  disputeReason: string | null;
  disputeCreatedAt: string | null;
  disputeUpdatedAt: string | null;
  disputeClosedAt: string | null;
  disputeEvidenceDueBy: string | null;
  requiresManualReview: boolean;
  customer: AdminPaymentDisputePartyDto;
  trip: {
    requestId: string;
    driver: AdminPaymentDisputePartyDto | null;
    driverPayoutState: DriverPayoutState;
  } | null;
  walletTopUpId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPaymentDisputesListResponseDto {
  items: AdminPaymentDisputeItemDto[];
  total: number;
  summary: AdminPaymentDisputeSummaryDto;
}
