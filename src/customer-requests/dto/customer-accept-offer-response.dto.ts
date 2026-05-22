import { DriverOfferStatus, TransportRequestStatus } from '@prisma/client';

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
    assignedDriverId: string;
    acceptedOfferId: string;
    acceptedAt: string;
  };
  acceptedOffer: AcceptedOfferResponseDto;
  rejectedOffersCount: number;
  nextStep: 'TRACK_REQUEST';
}
