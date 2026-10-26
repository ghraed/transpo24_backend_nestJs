import * as transport from './google-routes.transport';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import type { Server } from 'node:http';
import { AuthService } from '../auth/auth.service';
import { DriverAuthGuard } from '../auth/guards/driver-auth.guard';
import { TranslationCacheService } from '../translations/translation-cache.service';
import { RoutesController, RoutesRateLimitGuard } from './routes.controller';
import { RoutesService } from './routes.service';

let app: INestApplication;
const counters = { incrementRateLimitCounter: jest.fn().mockResolvedValue(1) };
const payload = {
  origin: { latitude: 47, longitude: 8 },
  destination: { latitude: 48, longitude: 9 },
};
beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [RoutesController],
    providers: [
      RoutesService,
      RoutesRateLimitGuard,
      DriverAuthGuard,
      { provide: ConfigService, useValue: { get: () => 'private-key' } },
      { provide: TranslationCacheService, useValue: counters },
      {
        provide: AuthService,
        useValue: {
          getUserFromAccessToken: (token: string) =>
            token === 'driver'
              ? { id: 'driver', role: UserRole.DRIVER, hasDriverProfile: true }
              : { id: 'customer', role: UserRole.CUSTOMER },
          isUserActive: () => Promise.resolve(true),
        },
      },
    ],
  }).compile();
  app = module.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.init();
});
afterAll(async () => {
  await app.close();
});
afterEach(() => {
  jest.restoreAllMocks();
  counters.incrementRateLimitCounter.mockResolvedValue(1);
});
it('blocks anonymous callers and customers before calling Google', async () => {
  const fetcher = jest.spyOn(transport, 'requestGoogleRoutes');
  await request(app.getHttpServer() as Server)
    .post('/driver/routes/compute')
    .send(payload)
    .expect(401);
  await request(app.getHttpServer() as Server)
    .post('/driver/routes/compute')
    .set('Authorization', 'Bearer customer')
    .send(payload)
    .expect(403);
  expect(fetcher).not.toHaveBeenCalled();
});
it('rejects extra fields and invalid coordinates', async () => {
  await request(app.getHttpServer() as Server)
    .post('/driver/routes/compute')
    .set('Authorization', 'Bearer driver')
    .send({ ...payload, key: 'untrusted' })
    .expect(400);
  await request(app.getHttpServer() as Server)
    .post('/driver/routes/compute')
    .set('Authorization', 'Bearer driver')
    .send({ ...payload, origin: { latitude: 100, longitude: 8 } })
    .expect(400);
});
it('returns route data to a driver without exposing the server key', async () => {
  jest.spyOn(transport, 'requestGoogleRoutes').mockResolvedValue({
    routes: [
      {
        description: 'A1',
        distanceMeters: 100,
        duration: '20s',
        polyline: { encodedPolyline: 'abc' },
      },
    ],
  });
  const response = await request(app.getHttpServer() as Server)
    .post('/driver/routes/compute')
    .set('Authorization', 'Bearer driver')
    .send(payload)
    .expect(201);
  expect(response.body.routes[0].overview_polyline.points).toBe('abc');
  expect(JSON.stringify(response.body)).not.toContain('private-key');
});
it('rejects excessive requests before calling Google', async () => {
  counters.incrementRateLimitCounter.mockResolvedValue(31);
  const fetcher = jest.spyOn(transport, 'requestGoogleRoutes');
  await request(app.getHttpServer() as Server)
    .post('/driver/routes/compute')
    .set('Authorization', 'Bearer driver')
    .send(payload)
    .expect(429);
  expect(fetcher).not.toHaveBeenCalled();
});
