import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SavePlaceDto } from './dto/save-place.dto';

type Address = {
  address: string;
  latitude: number;
  longitude: number;
  placeId?: string;
};
export const locationKey = (point: { latitude: number; longitude: number }) =>
  `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;

@Injectable()
export class CustomerPlacesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(customerId: string) {
    const [saved, recent] = await Promise.all([
      this.prisma.savedPlace.findMany({
        where: { customerId },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      }),
      this.recent(customerId),
    ]);
    return { saved, recent };
  }

  save(customerId: string, dto: SavePlaceDto) {
    const key = locationKey(dto);
    return this.prisma.savedPlace.upsert({
      where: { customerId_locationKey: { customerId, locationKey: key } },
      create: { ...dto, customerId, locationKey: key },
      update: { ...dto, placeId: dto.placeId ?? null },
    });
  }

  async remove(customerId: string, id: string) {
    const result = await this.prisma.savedPlace.deleteMany({
      where: { id, customerId },
    });
    if (!result.count) throw new NotFoundException('Saved place not found.');
  }

  async recent(customerId: string): Promise<Address[]> {
    const found = new Map<string, Address>();
    let cursor: string | undefined;
    // Page through submitted requests so repeated routes do not hide older distinct addresses.
    while (found.size < 5) {
      const requests = await this.prisma.transportRequest.findMany({
        where: { customerId, submittedAt: { not: null } },
        orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
        take: 50,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          pickupAddress: true,
          pickupLatitude: true,
          pickupLongitude: true,
          pickupPlaceId: true,
          dropoffAddress: true,
          dropoffLatitude: true,
          dropoffLongitude: true,
          dropoffPlaceId: true,
        },
      });
      for (const request of requests) {
        for (const kind of ['pickup', 'dropoff'] as const) {
          const address = request[`${kind}Address`];
          const latitude = request[`${kind}Latitude`];
          const longitude = request[`${kind}Longitude`];
          if (
            !address?.trim() ||
            latitude === null ||
            longitude === null ||
            !Number.isFinite(latitude) ||
            Math.abs(latitude) > 90 ||
            !Number.isFinite(longitude) ||
            Math.abs(longitude) > 180
          )
            continue;
          const point = {
            address,
            latitude,
            longitude,
            placeId: request[`${kind}PlaceId`] ?? undefined,
          };
          const key = locationKey(point);
          if (!found.has(key)) found.set(key, point);
          if (found.size === 5) return [...found.values()];
        }
      }
      if (requests.length < 50) break;
      cursor = requests[requests.length - 1].id;
    }
    return [...found.values()];
  }
}
