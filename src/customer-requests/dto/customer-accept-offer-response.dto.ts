import { DriverOfferStatus, TransportRequestStatus } from '@prisma/client';
import { PaymentSummaryDto } from '../../payments/dto/request-payment.dto';

export interface AcceptedOfferResponseDto {
  id: string;
  requestId: string;
  driverId: string;
  price: number;
  currency: string;
  estimatedPickupAt: string | null;
  estimatedDeliveryAt: string | null;
  estimatedDurationMinutes: number | null;
  message: string | null;
  status: DriverOfferStatus;
  acceptedAt: string | null;
  createdAt: string;
}

export interface CustomerAcceptOfferResponseDto {
  request: {
    id: string;
    status: TransportRequestStatus;
    assignedDriverId: string | null;
    acceptedOfferId: string | null;
    acceptedAt: string | null;
  };
  acceptedOffer: AcceptedOfferResponseDto;
  payment: PaymentSummaryDto;
  rejectedOffersCount: number;
  nextStep: 'CONFIRM_PAYMENT' | 'TRACK_REQUEST';
}
