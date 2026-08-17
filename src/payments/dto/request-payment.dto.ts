import {
  CustomerWalletTopUpStatus,
  DriverPayoutState,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  PaymentTransactionType,
  TripPaymentSettlementStatus,
} from '@prisma/client';

export interface SavedPaymentMethodSummaryDto {
  id: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
}

export interface PaymentSummaryDto {
  id: string;
  requestId: string;
  acceptedOfferId: string;
  customerId: string;
  driverId: string;
  amount: number;
  heldAmount: number;
  capturedAmount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  provider: PaymentProvider;
  status: PaymentStatus;
  stripePaymentIntentId: string | null;
  stripeClientSecret: string | null;
  stripeChargeId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdditionalChargeResponseDto {
  id: string;
  requestId: string;
  driverId: string;
  customerId: string;
  amount: number;
  appFeeAmount: number;
  totalChargeAmount: number;
  currency: string;
  reason: string;
  equipmentType: string | null;
  invoiceUrl: string;
  invoice: {
    originalFilename: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
  };
  approval: {
    approvedAt: string | null;
    approvedByCustomerId: string | null;
    confirmationLocale: string | null;
    confirmationText: string | null;
  };
  payment: {
    paymentOption: 'SAVED_CARD' | 'CASH_ON_DELIVERY' | null;
    stripePaymentIntentId: string | null;
    stripeChargeId: string | null;
    savedPaymentMethod: SavedPaymentMethodSummaryDto | null;
    failureReason: string | null;
  };
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerWalletTransactionDto {
  id: string;
  amount: number;
  currency: string;
  type: PaymentTransactionType;
  description: string | null;
  paymentHoldId: string | null;
  walletTopUpId: string | null;
  additionalChargeId: string | null;
  createdAt: string;
}

export interface CustomerWalletSummaryDto {
  id: string | null;
  customerId: string;
  currency: string | null;
  balance: number;
  reservedBalance: number;
  availableBalance: number;
  recentTransactions: CustomerWalletTransactionDto[];
}

export interface CustomerWalletTopUpDto {
  id: string;
  walletId: string | null;
  customerId: string;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  provider: PaymentProvider;
  status: CustomerWalletTopUpStatus;
  stripePaymentIntentId: string | null;
  stripeClientSecret: string | null;
  stripeChargeId: string | null;
  requiresManualReview: boolean;
  stripeDisputeId: string | null;
  disputeStatus: string | null;
  disputeReason: string | null;
  disputeAmount: number | null;
  disputeCurrency: string | null;
  disputeCreatedAt: string | null;
  disputeUpdatedAt: string | null;
  disputeClosedAt: string | null;
  disputeEvidenceDueBy: string | null;
  failureReason: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerWalletTopUpResponseDto {
  topUp: CustomerWalletTopUpDto;
  wallet: CustomerWalletSummaryDto;
}

export interface TripPaymentSettlementDto {
  id: string;
  requestId: string;
  paymentHoldId: string;
  customerId: string;
  driverId: string | null;
  currency: string;
  collectedAmount: number;
  refundableAmount: number;
  refundedAmount: number;
  retainedAmount: number;
  driverShareAmount: number;
  platformShareAmount: number;
  status: TripPaymentSettlementStatus;
  driverPayoutState: DriverPayoutState;
  requiresManualReview: boolean;
  lastStripeRefundId: string | null;
  disputeReportedAt: string | null;
  stripeDisputeId: string | null;
  disputeStatus: string | null;
  disputeReason: string | null;
  disputeAmount: number | null;
  disputeCurrency: string | null;
  disputeCreatedAt: string | null;
  disputeUpdatedAt: string | null;
  disputeClosedAt: string | null;
  disputeEvidenceDueBy: string | null;
  payoutFailureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CancelTripPaymentResponseDto {
  requestStatus: string;
  currency: string;
  refundedAmount: number;
  retainedAmount: number;
}
