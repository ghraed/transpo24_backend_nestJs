import { DriverOfferStatus } from '@prisma/client';

export interface CustomerRequestOfferSummaryDto {
  id: string;
  offerId: string;
  requestId: string;
  driverId: string;
  driverName: string | null;
  driverVehiclePhoto: string | null;
  driverRating: number | null;
  price: number;
  proposedPrice: number;
  currency: string;
  estimatedPickupAt: string | null;
  estimatedArrivalTime: string | null;
  estimatedDeliveryAt: string | null;
  estimatedDurationMinutes: number | null;
  message: string | null;
  status: DriverOfferStatus;
  offerStatus: DriverOfferStatus;
  createdAt: string;
  acceptedAt: string | null;
}

export interface CustomerRequestOffersResponseDto {
  requestId: string;
  offers: CustomerRequestOfferSummaryDto[];
}
