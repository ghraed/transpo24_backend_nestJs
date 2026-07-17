import { PaymentMethod, PaymentProvider, PaymentStatus } from '@prisma/client';

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
    stripePaymentIntentId: string | null;
    stripeChargeId: string | null;
    savedPaymentMethod: SavedPaymentMethodSummaryDto | null;
    failureReason: string | null;
  };
  status: string;
  createdAt: string;
  updatedAt: string;
}
