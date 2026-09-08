import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { DOCUMENT_TYPES, IncomingFile, validateFile } from './file-validation';

const META = {
  id: true,
  requestId: true,
  category: true,
  documentType: true,
  fileName: true,
  mimeType: true,
  size: true,
  createdAt: true,
  uploadedById: true,
} satisfies Prisma.RequestFileSelect;
const FUNDED: PaymentStatus[] = [
  'PAYMENT_HELD',
  'DELIVERY_CONFIRMED',
  'PAYMENT_CAPTURE_PENDING',
  'PAYMENT_CAPTURED',
  'PAYMENT_PARTIALLY_REFUNDED',
];

@Injectable()
export class RequestFilesService {
  constructor(private readonly prisma: PrismaService) {}

  async access(user: AuthenticatedUser, requestId: string) {
    const request = await this.prisma.transportRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        customerId: true,
        assignedDriverId: true,
        acceptedOfferId: true,
        vehicleDocumentPromptOfferId: true,
        status: true,
        paymentStatus: true,
        assignedDriver: { select: { userId: true } },
        acceptedOffer: { select: { driverId: true } },
        service: { select: { key: true } },
      },
    });
    if (!request) throw new NotFoundException('Request not found.');
    const selectedDriver =
      request.assignedDriver?.userId === user.id &&
      Boolean(request.acceptedOfferId) &&
      request.acceptedOffer?.driverId === request.assignedDriverId;
    if (
      user.role !== UserRole.ADMIN &&
      request.customerId !== user.id &&
      !selectedDriver
    ) {
      throw new ForbiddenException(
        'These files are private to the customer, selected driver and administration.',
      );
    }
    return request;
  }

  async list(user: AuthenticatedUser, requestId: string) {
    const request = await this.access(user, requestId);
    const files = await this.prisma.requestFile.findMany({
      where: { requestId, category: 'OFFICIAL' },
      select: META,
      orderBy: { createdAt: 'asc' },
    });
    const canUpload =
      request.customerId === user.id &&
      request.service.key === 'VEHICLE_TRANSPORT' &&
      Boolean(request.assignedDriverId && request.acceptedOfferId) &&
      request.acceptedOffer?.driverId === request.assignedDriverId &&
      request.paymentStatus !== null &&
      FUNDED.includes(request.paymentStatus) &&
      !['CANCELLED', 'EXPIRED'].includes(request.status);
    const chatFiles =
      user.role === UserRole.ADMIN
        ? await this.prisma.requestFile.findMany({
            where: { requestId, category: 'CHAT' },
            select: META,
            orderBy: { createdAt: 'asc' },
          })
        : undefined;
    return {
      files,
      chatFiles,
      canUpload,
      shouldPrompt:
        canUpload &&
        files.length === 0 &&
        request.vehicleDocumentPromptOfferId !== request.acceptedOfferId,
    };
  }

  async acknowledge(user: AuthenticatedUser, requestId: string) {
    const request = await this.access(user, requestId);
    if (
      request.customerId !== user.id ||
      !(await this.list(user, requestId)).canUpload
    )
      throw new ForbiddenException();
    await this.prisma.transportRequest.update({
      where: { id: requestId },
      data: { vehicleDocumentPromptOfferId: request.acceptedOfferId },
    });
    return { ok: true };
  }

  async uploadOfficial(
    user: AuthenticatedUser,
    requestId: string,
    documentType: string,
    file?: IncomingFile,
  ) {
    if (
      !DOCUMENT_TYPES.includes(documentType as (typeof DOCUMENT_TYPES)[number])
    )
      throw new BadRequestException('Choose a document type.');
    const request = await this.access(user, requestId);
    if (!(await this.list(user, requestId)).canUpload)
      throw new ForbiddenException(
        'Documents can be uploaded after a driver is selected and payment is held.',
      );
    const validated = validateFile(file);
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.requestFile.create({
        data: {
          ...validated,
          requestId,
          uploadedById: user.id,
          category: 'OFFICIAL',
          documentType,
        },
        select: META,
      });
      await tx.transportRequest.update({
        where: { id: requestId },
        data: { vehicleDocumentPromptOfferId: request.acceptedOfferId },
      });
      return created;
    });
  }

  async content(user: AuthenticatedUser, id: string) {
    const meta = await this.prisma.requestFile.findUnique({
      where: { id },
      select: { requestId: true },
    });
    if (!meta) throw new NotFoundException('File not found.');
    await this.access(user, meta.requestId);
    const file = await this.prisma.requestFile.findUnique({ where: { id } });
    if (!file) throw new NotFoundException('File not found.');
    return file;
  }
}
