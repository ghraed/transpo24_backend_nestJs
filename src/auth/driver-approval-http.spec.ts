import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DriverAuthGuard } from './guards/driver-auth.guard';
import { ApprovedDriverGuard } from './guards/approved-driver.guard';
import { assertDriverApproved } from './driver-approval';
import { DriverController } from '../driver/driver.controller';
import { DriverService } from '../driver/driver.service';

describe('driver approval HTTP boundary', () => {
  let app: INestApplication;
  let status = 'PENDING_PROFILE';
  const sendOffer = jest.fn().mockResolvedValue({ success: true });
  const auth = {
    getUserFromAccessToken: () => ({
      id: 'driver-user',
      role: 'DRIVER',
      hasDriverProfile: true,
    }),
    isUserActive: async () => true,
    assertDriverApproved: async () =>
      assertDriverApproved({ status, isProfileCompleted: true }),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [DriverController, AuthController],
      providers: [
        DriverAuthGuard,
        ApprovedDriverGuard,
        { provide: AuthService, useValue: auth },
        {
          provide: DriverService,
          useValue: {
            sendDriverPriceOffer: sendOffer,
            getDriverRequestAlerts: async () => ({
              alerts: [],
              locationReference: 'NONE',
            }),
          },
        },
      ],
    })
      .useMocker(() => ({}))
      .compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    status = 'PENDING_PROFILE';
    sendOffer.mockClear();
  });
  it('allows authenticated browsing without admin approval', async () => {
    await request(app.getHttpServer() as Server)
      .get('/driver/requests/alerts')
      .set('Authorization', 'Bearer token')
      .expect(200, { alerts: [], locationReference: 'NONE' });
  });
  it.each([
    'PENDING_PROFILE',
    'PENDING_DOCUMENTS',
    'PENDING_REVIEW',
    'SUSPENDED',
    'REJECTED',
  ])('blocks direct offers from %s drivers', async (driverStatus) => {
    status = driverStatus;
    const response = await request(app.getHttpServer() as Server)
      .post('/driver/requests/r/offers')
      .set('Authorization', 'Bearer token')
      .send({ requestVersion: 'v', price: 50, currency: 'USD' })
      .expect(403);
    expect(response.body.code).toBe('DRIVER_APPROVAL_REQUIRED');
    expect(sendOffer).not.toHaveBeenCalled();
  });
  it.each([
    ['patch', '/driver/requests/r/seen'],
    ['post', '/driver/requests/r/accept-alert'],
    ['post', '/driver/requests/r/additional-charges'],
    ['patch', '/driver/trips/r/pickup-item'],
    ['post', '/driver/trips/r/start-pickup'],
    ['patch', '/driver/trips/r/start-delivery'],
    ['patch', '/driver/trips/r/deliver-item'],
    ['get', '/driver/jobs/r'],
  ])('guards %s %s before executing its action', async (method, path) => {
    const agent = request(app.getHttpServer() as Server);
    const call =
      method === 'post'
        ? agent.post(path)
        : method === 'patch'
          ? agent.patch(path)
          : agent.get(path);
    await call.set('Authorization', 'Bearer token').expect(403);
  });
  it('enables offers only after approval and disables them again after revocation', async () => {
    status = 'APPROVED';
    await request(app.getHttpServer() as Server)
      .post('/driver/requests/r/offers')
      .set('Authorization', 'Bearer token')
      .send({ requestVersion: 'v', price: 50, currency: 'USD' })
      .expect(201);
    expect(sendOffer).toHaveBeenCalledTimes(1);
    status = 'SUSPENDED';
    await request(app.getHttpServer() as Server)
      .post('/driver/requests/r/offers')
      .set('Authorization', 'Bearer token')
      .send({ requestVersion: 'v', price: 50, currency: 'USD' })
      .expect(403);
    expect(sendOffer).toHaveBeenCalledTimes(1);
  });
  it.each(['/auth/driver/register', '/auth/driver/login'])(
    'requires phone verification instead of %s',
    async (path) => {
      await request(app.getHttpServer() as Server)
        .post(path)
        .send({ email: 'driver@example.com', password: 'password123' })
        .expect(403);
    },
  );
});
