import { DriverOfferStatus, TransportRequestStatus } from '@prisma/client';

export interface DriverOfferResponseDto {
  id: string;
  requestId: string;
  driverId: string;
  alertId: string | null;
  price: number;
  currency: string;
  estimatedPickupAt: string | null;
  estimatedDeliveryAt: string | null;
  estimatedDurationMinutes: number | null;
  message: string | null;
  status: DriverOfferStatus;
  expiresAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SendDriverPriceOfferResponseDto {
  offer: DriverOfferResponseDto;
  request: {
    id: string;
    status: TransportRequestStatus;
  };
  nextStep: 'WAIT_FOR_CUSTOMER_RESPONSE';
}
