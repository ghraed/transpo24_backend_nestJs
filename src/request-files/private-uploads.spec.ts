import { mkdtemp, writeFile, rm, symlink, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrivateUploadsController } from './private-uploads.controller';
import { PrivateUploadsService } from './private-uploads.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';

describe('legacy private upload authorization', () => {
  let app: any;
  let dir: string;
  let outside: string;
  let route: string;
  let image: Buffer;
  const lookup = () => ({ findFirst: jest.fn().mockResolvedValue(null) });
  const db: any = {
    transportRequestPhoto: lookup(),
    transportRequestProofPhoto: lookup(),
    driverDocument: lookup(),
    additionalCharge: lookup(),
    driverProfile: { ...lookup(), findUnique: jest.fn() },
    transportRequest: { findUnique: jest.fn(), findMany: jest.fn() },
    driverAvailability: { findUnique: jest.fn() },
    driverVehicle: { findMany: jest.fn().mockResolvedValue([]) },
  };
  beforeAll(async () => {
    await mkdir('uploads', { recursive: true });
    dir = await mkdtemp(join(process.cwd(), 'uploads', 'audit-private-'));
    outside = await mkdtemp(join(tmpdir(), 'audit-outside-'));
    image = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();
    await writeFile(join(dir, 'photo.png'), image);
    await writeFile(join(outside, 'private.png'), image);
    await symlink(join(outside, 'private.png'), join(dir, 'escape.png'));
    route = '/uploads/' + basename(dir) + '/photo.png';
    const module = await Test.createTestingModule({
      controllers: [PrivateUploadsController],
      providers: [
        PrivateUploadsService,
        { provide: PrismaService, useValue: db },
        {
          provide: AuthService,
          useValue: {
            getUserFromAccessToken: (id: string) =>
              ['owner', 'other', 'driver', 'admin', 'pending'].includes(id)
                ? {
                    id,
                    role:
                      id === 'admin'
                        ? 'ADMIN'
                        : ['driver', 'pending'].includes(id)
                          ? 'DRIVER'
                          : 'CUSTOMER',
                  }
                : null,
            isUserActive: async () => true,
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    await rm(dir, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });
  beforeEach(() => {
    jest.clearAllMocks();
    for (const model of [
      'transportRequestPhoto',
      'transportRequestProofPhoto',
      'driverDocument',
      'additionalCharge',
      'driverProfile',
    ])
      db[model].findFirst.mockResolvedValue(null);
    db.transportRequest.findMany.mockResolvedValue([]);
    db.transportRequest.findUnique.mockResolvedValue({
      customerId: 'owner',
      assignedDriverId: 'd',
      acceptedOfferId: 'o',
      assignedDriver: { userId: 'driver' },
    });
    db.driverProfile.findUnique.mockResolvedValue({
      id: 'd',
      userId: 'driver',
      status: 'APPROVED',
      isProfileCompleted: true,
    });
  });
  it('rejects anonymous and invalid bearer tokens on legacy URLs', async () => {
    await request(app.getHttpServer()).get('/uploads/a/file.jpg').expect(401);
    await request(app.getHttpServer())
      .get('/uploads/a/file.jpg')
      .set('Authorization', 'Bearer invalid')
      .expect(401);
  });
  it.each([
    'transportRequestPhoto',
    'transportRequestProofPhoto',
    'additionalCharge',
  ])('rejects an unrelated customer for %s', async (model) => {
    db[model].findFirst.mockResolvedValue({
      requestId: 'r',
      mimeType: 'image/jpeg',
    });
    await request(app.getHttpServer())
      .get('/uploads/a/file.jpg')
      .set('Authorization', 'Bearer other')
      .expect(403);
  });
  it.each([
    'transportRequestPhoto',
    'transportRequestProofPhoto',
    'additionalCharge',
  ])('rejects an unassigned/ineligible driver for %s', async (model) => {
    db[model].findFirst.mockResolvedValue({
      requestId: 'r',
      mimeType: 'image/jpeg',
    });
    db.driverProfile.findUnique.mockResolvedValue({
      id: 'other-driver',
      status: 'APPROVED',
      isProfileCompleted: true,
    });
    db.driverAvailability.findUnique.mockResolvedValue(null);
    await request(app.getHttpServer())
      .get('/uploads/a/file.jpg')
      .set('Authorization', 'Bearer driver')
      .expect(403);
  });
  it('does not share personal driver identity documents with customers', async () => {
    db.driverDocument.findFirst.mockResolvedValue({
      type: 'DRIVING_LICENSE',
      driver: { id: 'd', userId: 'driver' },
    });
    await request(app.getHttpServer())
      .get('/uploads/a/file.jpg')
      .set('Authorization', 'Bearer owner')
      .expect(403);
  });
  it('denies unknown files and traversal', async () => {
    await request(app.getHttpServer())
      .get('/uploads/a/file.jpg')
      .set('Authorization', 'Bearer owner')
      .expect(404);
    await expect(
      new PrivateUploadsService(db).file(
        { id: 'owner', role: 'CUSTOMER' } as any,
        '../secret',
      ),
    ).rejects.toThrow();
  });
  it.each([
    'transportRequestPhoto',
    'transportRequestProofPhoto',
    'additionalCharge',
  ])('streams authorized %s bytes privately', async (model) => {
    db[model].findFirst.mockResolvedValue({
      requestId: 'r',
      mimeType: 'image/png',
      invoiceMimeType: 'image/png',
    });
    for (const actor of ['owner', 'driver', 'admin']) {
      const res = await request(app.getHttpServer())
        .get(route)
        .set('Authorization', 'Bearer ' + actor)
        .expect(200);
      expect(res.body).toEqual(image);
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    }
  });
  it.each(['driverDocument', 'driverProfile'])(
    'allows a driver to read their own %s, including onboarding',
    async (model) => {
      db[model].findFirst.mockResolvedValue(
        model === 'driverDocument'
          ? {
              type: 'DRIVING_LICENSE',
              mimeType: 'image/png',
              driver: { id: 'd', userId: 'pending' },
            }
          : { id: 'd', userId: 'pending' },
      );
      await request(app.getHttpServer())
        .get(route)
        .set('Authorization', 'Bearer pending')
        .expect(200);
      await request(app.getHttpServer())
        .get(route)
        .set('Authorization', 'Bearer other')
        .expect(403);
    },
  );
  it('shares a vehicle/profile photo only after this customer secures the assigned booking', async () => {
    db.driverDocument.findFirst.mockResolvedValue({
      type: 'VEHICLE_FRONT_PHOTO',
      mimeType: 'image/png',
      driver: { id: 'd', userId: 'driver' },
    });
    await request(app.getHttpServer())
      .get(route)
      .set('Authorization', 'Bearer owner')
      .expect(403);
    db.transportRequest.findMany.mockResolvedValue([
      { status: 'DRIVER_ASSIGNED', paymentHold: { authorizedAt: new Date() } },
    ]);
    await request(app.getHttpServer())
      .get(route)
      .set('Authorization', 'Bearer owner')
      .expect(200);
  });
  it('never follows an authorized-looking symlink outside the private upload root', async () => {
    db.transportRequestPhoto.findFirst.mockResolvedValue({
      requestId: 'r',
      mimeType: 'image/png',
    });
    await request(app.getHttpServer())
      .get(route.replace('photo.png', 'escape.png'))
      .set('Authorization', 'Bearer owner')
      .expect(404);
  });
});
