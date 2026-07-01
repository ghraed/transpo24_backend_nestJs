import {
  TransportProofPhotoType,
  TransportRequestStatus,
} from '@prisma/client';

export class RequestProofPhotoDto {
  id!: string;
  type!: TransportProofPhotoType;
  url!: string;
  mimeType!: string;
  sizeBytes!: number;
  sortOrder!: number;
  createdAt!: string;
}

export class CustomerRequestTrackingResponseDto {
  requestId!: string;
  currentStatus!: TransportRequestStatus;
  assignedDriverId!: string | null;
  driverName!: string | null;
  driverVehiclePhoto!: string | null;
  pickupLocation!: {
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    placeId: string | null;
  };
  deliveryLocation!: {
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    placeId: string | null;
  };
  latestDriverLocation!: {
    latitude: number;
    longitude: number;
    heading: number | null;
    speed: number | null;
    accuracy: number | null;
    recordedAt: string;
  } | null;
  pickupProofPhotos!: RequestProofPhotoDto[];
  deliveryProofPhotos!: RequestProofPhotoDto[];
  nearDeliveryNotifiedAt!: string | null;
  deliveredAt!: string | null;
  ratingAvailable!: boolean;
  updatedAt!: string;
}
