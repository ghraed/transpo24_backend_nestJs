import { DriverOfferStatus, DriverStatus, TransportRequestStatus, UserRole } from '@prisma/client';

export type TripUserRole = UserRole;

export type AcceptDriverOfferInput = {
  customerId: string;
  tripId: string;
  offerId: string;
};

export type JoinTripRoomInput = {
  userId: string;
  role: TripUserRole;
  tripId: string;
};

export type DriverLocationInput = {
  driverId: string;
  tripId: string;
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
};

export type DriverArrivedPickupInput = {
  driverId: string;
  tripId: string;
  latitude: number;
  longitude: number;
};

export type PickupItemInput = {
  driverId: string;
  tripId: string;
  latitude?: number;
  longitude?: number;
  notes?: string;
  proofImageUrl?: string;
};

export type OfferAcceptedPayload = {
  tripId: string;
  driverId: string;
  customerId: string;
  pickupLocation: {
    latitude: number;
    longitude: number;
    address: string | null;
  };
  dropoffLocation: {
    latitude: number;
    longitude: number;
    address: string | null;
  };
  status: TransportRequestStatus;
};

export type TripStatusUpdatedPayload = {
  tripId: string;
  status: TransportRequestStatus;
  updatedAt: string;
};

export type DriverLocationUpdatedPayload = {
  tripId: string;
  driverId: string;
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  accuracy: number | null;
  recordedAt: string;
};

export type DriverArrivedPickupConfirmedPayload = {
  tripId: string;
  driverId: string;
  status: TransportRequestStatus;
  arrivedAt: string;
};

export type PickupItemResponse = {
  tripId: string;
  driverId: string;
  customerId: string;
  status: TransportRequestStatus;
  pickedUpAt: string;
  pickupNotes: string | null;
  pickupProofImageUrl: string | null;
  nextStep: 'DELIVER_ITEM';
};

export type ItemPickedUpPayload = {
  tripId: string;
  driverId: string;
  customerId: string;
  status: 'ITEM_PICKED_UP';
  pickedUpAt: string;
  pickupNotes: string | null;
  pickupProofImageUrl: string | null;
};

export type TripAccessRecord = {
  id: string;
  customerId: string;
  assignedDriverId: string | null;
  status: TransportRequestStatus;
};

export type OfferValidationRecord = {
  id: string;
  requestId: string;
  driverId: string;
  status: DriverOfferStatus;
  expiresAt: Date | null;
  acceptedAt: Date | null;
  rejectedAt: Date | null;
  cancelledAt: Date | null;
};

export type DriverEligibility = {
  id: string;
  status: DriverStatus;
  isProfileCompleted: boolean;
  vehicles: Array<{ id: string }>;
  availability: { isOnline: boolean } | null;
};
