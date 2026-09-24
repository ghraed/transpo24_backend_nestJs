import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuthService } from '../auth/auth.service';
import { configureHttpApplication } from '../config/http';
import {
  DriverCoverageController,
  AdminDriverCoverageController,
} from './driver-coverage.controller';
import { DriverCoverageService } from './driver-coverage.service';

describe('driver operational coverage HTTP authorization', () => {
  let app: INestApplication<App>;
  const auth = { getUserFromAccessToken: jest.fn(), isUserActive: jest.fn() };
  const coverage = {
    driverForUser: jest.fn(),
    list: jest.fn(),
    requestCountry: jest.fn(),
    requestRoute: jest.fn(),
    initializeHome: jest.fn(),
    reviewCountry: jest.fn(),
    reviewRoute: jest.fn(),
  };
  const own = '/driver/me/operational-coverage';
  const admin = '/admin/drivers/profile/operational-coverage';
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [DriverCoverageController, AdminDriverCoverageController],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: DriverCoverageService, useValue: coverage },
      ],
    }).compile();
    app = module.createNestApplication({ bodyParser: false });
    configureHttpApplication(app);
    await app.init();
  });
  afterAll(async () => app.close());
  beforeEach(() => {
    jest.clearAllMocks();
    auth.getUserFromAccessToken.mockReturnValue({
      id: 'user',
      role: 'DRIVER',
      hasDriverProfile: true,
    });
    auth.isUserActive.mockResolvedValue(true);
    coverage.driverForUser.mockResolvedValue('own-profile');
  });
  it.each([
    ['get', ''],
    ['post', '/initialize-home'],
    ['put', '/countries'],
    ['put', '/routes'],
  ] as const)(
    'admin %s %s rejects drivers, customers and anonymous users',
    async (method, suffix) => {
      await request(app.getHttpServer())
        [method](admin + suffix)
        .expect(401);
      for (const role of ['DRIVER', 'CUSTOMER']) {
        auth.getUserFromAccessToken.mockReturnValue({ id: 'user', role });
        await request(app.getHttpServer())
          [method](admin + suffix)
          .set('Authorization', 'Bearer token')
          .expect(403);
      }
    },
  );
  it.each([
    ['get', ''],
    ['post', '/countries'],
    ['post', '/routes'],
  ] as const)(
    'driver %s %s requires active driver identity',
    async (method, suffix) => {
      await request(app.getHttpServer())
        [method](own + suffix)
        .expect(401);
      auth.getUserFromAccessToken.mockReturnValue({
        id: 'user',
        role: 'CUSTOMER',
      });
      await request(app.getHttpServer())
        [method](own + suffix)
        .set('Authorization', 'Bearer token')
        .expect(403);
      auth.isUserActive.mockResolvedValue(false);
      await request(app.getHttpServer())
        [method](own + suffix)
        .set('Authorization', 'Bearer token')
        .expect(401);
    },
  );
  it('uses authenticated profile and normalized foreign country without trusting tenant IDs', async () => {
    await request(app.getHttpServer())
      .post(own + '/countries')
      .set('Authorization', 'Bearer token')
      .send({ countryCode: ' ch ', canPickup: true, canDropoff: false })
      .expect(201);
    expect(coverage.driverForUser).toHaveBeenCalledWith('user');
    expect(coverage.requestCountry).toHaveBeenCalledWith('own-profile', {
      countryCode: 'CH',
      canPickup: true,
      canDropoff: false,
    });
  });
  it.each([
    { status: 'APPROVED' },
    { driverId: 'foreign' },
    { tenantId: 'foreign' },
    { countryCode: 'ZZ' },
    { canPickup: null },
    { reviewedByAdminId: 'admin' },
  ])(
    'rejects privilege escalation or invalid country input %j',
    async (extra) => {
      await request(app.getHttpServer())
        .post(own + '/countries')
        .set('Authorization', 'Bearer token')
        .send({
          countryCode: 'FR',
          canPickup: true,
          canDropoff: true,
          ...extra,
        })
        .expect(400);
      expect(coverage.requestCountry).not.toHaveBeenCalled();
    },
  );
  it('validates route direction and rejects self approval', async () => {
    for (const extra of [
      { status: 'APPROVED' },
      { toCountryCode: null },
      { fromCountryCode: 'ZZ' },
    ]) {
      await request(app.getHttpServer())
        .post(own + '/routes')
        .set('Authorization', 'Bearer token')
        .send({ fromCountryCode: 'FR', toCountryCode: 'CH', ...extra })
        .expect(400);
    }
    await request(app.getHttpServer())
      .post(own + '/routes')
      .set('Authorization', 'Bearer token')
      .send({ fromCountryCode: ' fr ', toCountryCode: 'ch' })
      .expect(201);
    expect(coverage.requestRoute).toHaveBeenCalledWith('own-profile', {
      fromCountryCode: 'FR',
      toCountryCode: 'CH',
    });
  });
  it('allows admin review and records the authenticated actor', async () => {
    auth.getUserFromAccessToken.mockReturnValue({
      id: 'admin-user',
      role: 'ADMIN',
    });
    const dto = {
      fromCountryCode: 'FR',
      toCountryCode: 'CH',
      status: 'SUSPENDED',
    };
    await request(app.getHttpServer())
      .put(admin + '/routes')
      .set('Authorization', 'Bearer token')
      .send(dto)
      .expect(200);
    expect(coverage.reviewRoute).toHaveBeenCalledWith(
      'profile',
      dto,
      'admin-user',
    );
    await request(app.getHttpServer())
      .put(admin + '/routes')
      .set('Authorization', 'Bearer token')
      .send({ ...dto, status: null })
      .expect(400);
    await request(app.getHttpServer())
      .post(admin + '/initialize-home')
      .set('Authorization', 'Bearer token')
      .expect(201);
    expect(coverage.initializeHome).toHaveBeenCalledWith('profile');
  });
});
