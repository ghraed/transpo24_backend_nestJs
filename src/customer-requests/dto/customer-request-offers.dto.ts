import { DriverOfferStatus } from '@prisma/client';

export interface CustomerRequestOfferSummaryDto {
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
  createdAt: string;
  acceptedAt: string | null;
}

export interface CustomerRequestOffersResponseDto {
  requestId: string;
  offers: CustomerRequestOfferSummaryDto[];
}
