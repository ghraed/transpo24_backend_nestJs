import {
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
} from '@prisma/client';

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
  currency: string;
  reason: string;
  equipmentType: string | null;
  invoiceUrl: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}
