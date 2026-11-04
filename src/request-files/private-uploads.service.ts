import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { assertDriverApproved } from '../auth/driver-approval';
import {
  APPROVED_MATCHING_VEHICLE_WHERE,
  MATCHING_AVAILABILITY_SELECT,
  offerIneligibilityReason,
} from '../driver/request-eligibility';
import { driverDetailsAvailable } from '../payments/booking-policy';

@Injectable()
export class PrivateUploadsService {
  constructor(private readonly prisma: PrismaService) {}

  async file(user: AuthenticatedUser, path: string) {
    if (
      !path ||
      path.split('/').some((part) => !part || part === '.' || part === '..') ||
      /[\\\0%]/.test(path)
    )
      throw new NotFoundException();
    const key = `uploads/${path}`;
    const url = `/${key}`;
    const [photo, proof, document, invoice, profile] = await Promise.all([
      this.prisma.transportRequestPhoto.findFirst({
        where: { OR: [{ storageKey: key }, { url }] },
      }),
      this.prisma.transportRequestProofPhoto.findFirst({
        where: { OR: [{ storageKey: key }, { url }] },
      }),
      this.prisma.driverDocument.findFirst({
        where: { OR: [{ storageKey: key }, { url }] },
        include: { driver: true },
      }),
      this.prisma.additionalCharge.findFirst({
        where: { OR: [{ invoiceStorageKey: key }, { invoiceUrl: url }] },
      }),
      this.prisma.driverProfile.findFirst({
        where: { profilePhotoUrl: { in: [key, url] } },
      }),
    ]);
    const record = photo ?? proof ?? document ?? invoice ?? profile;
    if (!record) throw new NotFoundException();
    if (user.role !== 'ADMIN') {
      if (photo || proof || invoice) {
        await this.requestAccess(
          user,
          (photo ?? proof ?? invoice)!.requestId,
          Boolean(photo),
        );
      } else {
        const driver = document?.driver ?? profile!;
        if (driver.userId !== user.id) {
          const shareable =
            !document ||
            [
              'VEHICLE_FRONT_PHOTO',
              'VEHICLE_REAR_PHOTO',
              'VEHICLE_SIDE_PHOTO',
            ].includes(document.type);
          if (!shareable || user.role !== 'CUSTOMER')
            throw new ForbiddenException();
          const trips = await this.prisma.transportRequest.findMany({
            where: {
              customerId: user.id,
              assignedDriverId: driver.id,
              acceptedOfferId: { not: null },
            },
            include: { paymentHold: true },
          });
          if (
            !trips.some((trip) =>
              driverDetailsAvailable(
                trip.paymentHold?.capturedAt,
                trip.status,
                Date.now(),
                trip.paymentHold?.authorizedAt,
              ),
            )
          )
            throw new ForbiddenException();
        }
      }
    }
    const root = await realpath(resolve(process.cwd(), 'uploads'));
    let absolute: string;
    try {
      absolute = await realpath(resolve(root, path));
    } catch {
      throw new NotFoundException();
    }
    if (!absolute.startsWith(root + sep)) throw new NotFoundException();
    const mime =
      photo?.mimeType ??
      proof?.mimeType ??
      document?.mimeType ??
      invoice?.invoiceMimeType ??
      'image/jpeg';
    return {
      absolute,
      mime: [
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/pdf',
      ].includes(mime ?? '')
        ? mime
        : 'application/octet-stream',
    };
  }

  private async requestAccess(
    user: AuthenticatedUser,
    requestId: string,
    quotingPhoto: boolean,
  ) {
    const request = await this.prisma.transportRequest.findUnique({
      where: { id: requestId },
      include: { service: true, assignedDriver: true, paymentHold: true },
    });
    if (!request) throw new NotFoundException();
    if (user.role === 'CUSTOMER' && request.customerId === user.id) return;
    if (user.role !== 'DRIVER') throw new ForbiddenException();
    const driver = await this.prisma.driverProfile.findUnique({
      where: { userId: user.id },
    });
    assertDriverApproved(driver);
    if (
      request.assignedDriverId === driver!.id &&
      request.acceptedOfferId &&
      request.assignedDriver?.userId === user.id
    )
      return;
    if (quotingPhoto) {
      const [availability, vehicles] = await Promise.all([
        this.prisma.driverAvailability.findUnique({
          where: { driverId: driver!.id },
          select: MATCHING_AVAILABILITY_SELECT,
        }),
        this.prisma.driverVehicle.findMany({
          where: { driverId: driver!.id, ...APPROVED_MATCHING_VEHICLE_WHERE },
        }),
      ]);
      if (offerIneligibilityReason(request, availability, vehicles) === null)
        return;
    }
    throw new ForbiddenException();
  }
}
