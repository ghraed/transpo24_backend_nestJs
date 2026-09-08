import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { RequestFilesService } from './request-files.service';
import { validateFile, MAX_FILE_SIZE } from './file-validation';
import type { AuthenticatedUser } from '../auth/auth.types';

const user = (
  id: string,
  role: UserRole = UserRole.CUSTOMER,
): AuthenticatedUser => ({
  id,
  role,
  name: 'Test',
  email: 'test@example.com',
  hasDriverProfile: role === UserRole.DRIVER,
});
const pdf = {
  buffer: Buffer.from('%PDF-1.7\nprivate document'),
  originalname: '../contract.pdf',
  mimetype: 'application/pdf',
  size: 25,
};
function setup() {
  const request = {
    id: 'request',
    customerId: 'customer',
    assignedDriverId: 'driver-profile',
    assignedDriver: { userId: 'selected-driver' },
    acceptedOfferId: 'offer',
    acceptedOffer: { driverId: 'driver-profile' },
    vehicleDocumentPromptOfferId: null,
    status: 'ACCEPTED',
    paymentStatus: 'PAYMENT_HELD',
    service: { key: 'VEHICLE_TRANSPORT' },
  };
  const prisma = {
    transportRequest: {
      findUnique: jest.fn().mockResolvedValue(request),
      update: jest.fn(),
    },
    requestFile: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest
        .fn()
        .mockResolvedValue({ requestId: 'request', ...pdf, data: pdf.buffer }),
      create: jest.fn().mockResolvedValue({ id: 'file' }),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn(prisma),
  );
  return { request, prisma, service: new RequestFilesService(prisma as never) };
}
describe('private request documents', () => {
  it.each([
    user('customer'),
    user('selected-driver', UserRole.DRIVER),
    user('admin', UserRole.ADMIN),
  ])('allows content only for authorized participant $id', async (actor) => {
    const { service } = setup();
    await expect(service.content(actor, 'file')).resolves.toHaveProperty(
      'data',
    );
  });
  it.each([user('stranger'), user('unselected-driver', UserRole.DRIVER)])(
    'denies bytes to $id even with a known file ID',
    async (actor) => {
      const { service, prisma } = setup();
      await expect(service.content(actor, 'file')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.requestFile.findUnique).toHaveBeenCalledTimes(1); // Metadata only; bytes were never fetched.
    },
  );
  it('revokes access from a driver whose offer is no longer selected', async () => {
    const { service, request } = setup();
    request.acceptedOffer.driverId = 'another-profile';
    await expect(
      service.content(user('selected-driver', UserRole.DRIVER), 'file'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it.each(['PAYMENT_HOLD_PENDING', 'PAYMENT_FAILED', 'PAYMENT_RELEASED'])(
    'does not prompt or allow uploads with %s',
    async (status) => {
      const { service, request } = setup();
      request.paymentStatus = status;
      expect(await service.list(user('customer'), 'request')).toMatchObject({
        canUpload: false,
        shouldPrompt: false,
      });
      await expect(
        service.uploadOfficial(user('customer'), 'request', 'OTHER', pdf),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );
  it('prompts after driver selection and payment hold, and remembers the answer for that offer', async () => {
    const { service, request, prisma } = setup();
    expect(await service.list(user('customer'), 'request')).toMatchObject({
      canUpload: true,
      shouldPrompt: true,
    });
    await service.acknowledge(user('customer'), 'request');
    expect(prisma.transportRequest.update).toHaveBeenCalledWith({
      where: { id: 'request' },
      data: { vehicleDocumentPromptOfferId: 'offer' },
    });
    Object.assign(request, { vehicleDocumentPromptOfferId: 'offer' });
    expect(await service.list(user('customer'), 'request')).toMatchObject({
      shouldPrompt: false,
    });
  });
  it('does not let drivers upload official customer documents', async () => {
    const { service } = setup();
    await expect(
      service.uploadOfficial(
        user('selected-driver', UserRole.DRIVER),
        'request',
        'OTHER',
        pdf,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it.each(['PICKUP_AUTHORIZATION', 'INSURANCE', 'PURCHASE_PROOF', 'OTHER'])(
    'stores %s privately and separately from chat',
    async (kind) => {
      const { service, prisma } = setup();
      await service.uploadOfficial(user('customer'), 'request', kind, pdf);
      expect(prisma.requestFile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            documentType: kind,
            category: 'OFFICIAL',
            requestId: 'request',
            mimeType: 'application/pdf',
          }),
          select: expect.not.objectContaining({ data: true }),
        }),
      );
      expect(
        prisma.requestFile.create.mock.calls[0][0].data,
      ).not.toHaveProperty('url');
    },
  );
  it('rejects unrecognized document types', async () => {
    const { service } = setup();
    await expect(
      service.uploadOfficial(user('customer'), 'request', 'EXECUTABLE', pdf),
    ).rejects.toThrow();
  });
});
describe('document file validation', () => {
  it('sanitizes a filename and accepts PDF content', () => {
    expect(validateFile(pdf)).toMatchObject({
      fileName: 'contract.pdf',
      mimeType: 'application/pdf',
      size: pdf.buffer.length,
    });
  });
  it.each([
    { signature: Buffer.from([255, 216, 255, 224]), mime: 'image/jpeg' },
    {
      signature: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      mime: 'image/png',
    },
  ])('accepts $mime based on file bytes', ({ signature, mime }) => {
    expect(
      validateFile({ ...pdf, buffer: signature, mimetype: mime }).mimeType,
    ).toBe(mime);
  });
  it('rejects a disguised executable and MIME mismatch', () => {
    expect(() =>
      validateFile({ ...pdf, buffer: Buffer.from('MZ executable') }),
    ).toThrow();
    expect(() => validateFile({ ...pdf, mimetype: 'image/png' })).toThrow();
  });
  it('rejects empty and oversized uploads', () => {
    expect(() => validateFile()).toThrow();
    expect(() =>
      validateFile({ ...pdf, buffer: Buffer.alloc(MAX_FILE_SIZE + 1) }),
    ).toThrow();
  });
});
