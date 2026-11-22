import * as transport from './google-places.transport';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import type { Server } from 'node:http';
import { AuthService } from '../auth/auth.service';
import { DriverAuthGuard } from '../auth/guards/driver-auth.guard';
import { CustomerAuthGuard } from '../auth/guards/customer-auth.guard';
import { TranslationCacheService } from '../translations/translation-cache.service';
import {
  CustomerMapsPlacesController,
  PlacesController,
  PlacesRateLimitGuard,
} from './places.controller';
import { PlacesService } from './places.service';

let app: INestApplication;
const counters = { incrementRateLimitCounter: jest.fn().mockResolvedValue(1) };
const payload = { input: 'Steinweg Basel', languageCode: 'de' };
beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [PlacesController, CustomerMapsPlacesController],
    providers: [
      PlacesService,
      PlacesRateLimitGuard,
      DriverAuthGuard,
      CustomerAuthGuard,
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
  const fetcher = jest.spyOn(transport, 'requestGooglePlaces');
  await request(app.getHttpServer() as Server)
    .post('/driver/places/autocomplete')
    .send(payload)
    .expect(401);
  await request(app.getHttpServer() as Server)
    .post('/driver/places/autocomplete')
    .set('Authorization', 'Bearer customer')
    .send(payload)
    .expect(403);
  expect(fetcher).not.toHaveBeenCalled();
});
it('rejects extra fields and invalid coordinates', async () => {
  await request(app.getHttpServer() as Server)
    .post('/driver/places/autocomplete')
    .set('Authorization', 'Bearer driver')
    .send({ ...payload, key: 'untrusted' })
    .expect(400);
  await request(app.getHttpServer() as Server)
    .post('/driver/places/autocomplete')
    .set('Authorization', 'Bearer driver')
    .send({ ...payload, input: ' ' })
    .expect(400);
});
it('returns search predictions without exposing the server key', async () => {
  jest.spyOn(transport, 'requestGooglePlaces').mockResolvedValue({
    suggestions: [
      {
        placePrediction: {
          placeId: 'basel-id',
          text: { text: 'Steinweg, Basel' },
        },
      },
    ],
  });
  const response = await request(app.getHttpServer() as Server)
    .post('/driver/places/autocomplete')
    .set('Authorization', 'Bearer driver')
    .send(payload)
    .expect(201);
  expect(response.body.predictions).toEqual([
    { place_id: 'basel-id', description: 'Steinweg, Basel' },
  ]);
  expect(JSON.stringify(response.body)).not.toContain('private-key');
});
it.each([
  ['reverse', { latitude: 100, longitude: 7 }],
  ['reverse', { latitude: '47', longitude: 7 }],
  ['reverse', { latitude: 47, longitude: null }],
  ['reverse', { latitude: 47, longitude: 181 }],
  ['details', { placeId: '../arbitrary/path' }],
  ['details', { placeId: '' }],
  ['autocomplete', { input: 'Basel', languageCode: 'invalid locale' }],
])(
  'rejects invalid %s requests before reaching Google',
  async (operation, body) => {
    const fetcher = jest.spyOn(transport, 'requestGooglePlaces');
    await request(app.getHttpServer() as Server)
      .post(`/driver/places/${operation}`)
      .set('Authorization', 'Bearer driver')
      .send(body)
      .expect(400);
    expect(fetcher).not.toHaveBeenCalled();
  },
);
it('rejects excessive requests before calling Google', async () => {
  counters.incrementRateLimitCounter.mockResolvedValue(121);
  const fetcher = jest.spyOn(transport, 'requestGooglePlaces');
  await request(app.getHttpServer() as Server)
    .post('/driver/places/autocomplete')
    .set('Authorization', 'Bearer driver')
    .send(payload)
    .expect(429);
  expect(fetcher).not.toHaveBeenCalled();
});

it('allows only authenticated customers to use the server-side search', async () => {
  const fetcher = jest
    .spyOn(transport, 'requestGooglePlaces')
    .mockResolvedValue({ suggestions: [] });
  await request(app.getHttpServer() as Server)
    .post('/customer/maps/places/autocomplete')
    .send(payload)
    .expect(401);
  await request(app.getHttpServer() as Server)
    .post('/customer/maps/places/autocomplete')
    .set('Authorization', 'Bearer driver')
    .send(payload)
    .expect(403);
  expect(fetcher).not.toHaveBeenCalled();
  await request(app.getHttpServer() as Server)
    .post('/customer/maps/places/autocomplete')
    .set('Authorization', 'Bearer customer')
    .send({
      ...payload,
      location: { latitude: 47.56, longitude: 7.59 },
      sessionToken: 'session-123',
    })
    .expect(201);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('rejects untrusted customer Maps input and rate-limits before Google', async () => {
  const fetcher = jest.spyOn(transport, 'requestGooglePlaces');
  await request(app.getHttpServer() as Server)
    .post('/customer/maps/places/autocomplete')
    .set('Authorization', 'Bearer customer')
    .send({ ...payload, key: 'untrusted' })
    .expect(400);
  await request(app.getHttpServer() as Server)
    .post('/customer/maps/places/autocomplete')
    .set('Authorization', 'Bearer customer')
    .send({ ...payload, location: { latitude: 120, longitude: 7 } })
    .expect(400);
  counters.incrementRateLimitCounter.mockResolvedValue(121);
  await request(app.getHttpServer() as Server)
    .post('/customer/maps/places/country-center')
    .set('Authorization', 'Bearer customer')
    .send({ countryCode: 'CH' })
    .expect(429);
  expect(fetcher).not.toHaveBeenCalled();
});
