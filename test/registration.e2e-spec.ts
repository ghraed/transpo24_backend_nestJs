import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import sharp from 'sharp';
import { AuthService } from '../src/auth/auth.service';
import { CustomerAuthGuard } from '../src/auth/guards/customer-auth.guard';
import { configureHttpApplication } from '../src/config/http';
import { TranslationCacheService } from '../src/translations/translation-cache.service';
import { RegistrationController } from '../src/vehicles/registration/registration.controller';
import { RegistrationRateLimitGuard } from '../src/vehicles/registration/registration-rate-limit.guard';
import {
  RegistrationService,
  MAX_REGISTRATION_IMAGE_BYTES,
} from '../src/vehicles/registration/registration.service';
import { QwenRegistrationProvider } from '../src/vehicles/registration/qwen-registration.provider';
import { validateExtraction } from '../src/vehicles/registration/registration.schema';
import { syntheticExtraction } from '../src/vehicles/registration/registration.fixtures';

describe('registration extraction HTTP boundary', () => {
  let app: INestApplication<App>;
  let fixture: Buffer;
  let active = true;
  const provider = { assertConfigured: jest.fn(), extract: jest.fn() };
  const auth = {
    getUserFromAccessToken: (token: string) =>
      token === 'invalid'
        ? null
        : {
            id: token,
            role: token === 'driver' ? UserRole.DRIVER : UserRole.CUSTOMER,
          },
    isUserActive: async () => active,
  };
  beforeAll(async () => {
    fixture = await sharp({
      create: { width: 256, height: 128, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();
    const module = await Test.createTestingModule({
      controllers: [RegistrationController],
      providers: [
        CustomerAuthGuard,
        RegistrationRateLimitGuard,
        RegistrationService,
        { provide: AuthService, useValue: auth },
        { provide: QwenRegistrationProvider, useValue: provider },
        {
          provide: TranslationCacheService,
          useFactory: () =>
            new TranslationCacheService(new ConfigService({ REDIS_HOST: '' })),
        },
      ],
    }).compile();
    app = module.createNestApplication();
    configureHttpApplication(app);
    await app.init();
  });
  beforeEach(() => {
    active = true;
    jest.clearAllMocks();
    provider.extract.mockResolvedValue(
      validateExtraction(syntheticExtraction(), 1),
    );
  });
  afterAll(async () => {
    await app.close();
  });
  const scan = (token: string) =>
    request(app.getHttpServer())
      .post('/vehicles/extract-registration')
      .set('Authorization', `Bearer ${token}`);
  it('returns the typed private contract for either customer independently', async () => {
    const one = await scan('customer-one')
      .attach('images', fixture, 'synthetic.png')
      .expect(201);
    await scan('customer-two')
      .attach('images', fixture, 'synthetic.png')
      .expect(201);
    expect(one.headers['cache-control']).toBe('private, no-store');
    expect(one.body).toMatchObject({
      status: 'partial',
      fields: { emptyWeightKg: { value: null, evidence: [] } },
    });
    expect(provider.extract).toHaveBeenCalledTimes(2);
  });
  it('rejects missing, invalid, inactive and wrong-role authentication before decoding', async () => {
    await request(app.getHttpServer())
      .post('/vehicles/extract-registration')
      .expect(401);
    await scan('invalid')
      .attach('images', fixture, 'synthetic.png')
      .expect(401);
    await scan('driver').attach('images', fixture, 'synthetic.png').expect(403);
    active = false;
    await scan('inactive')
      .attach('images', fixture, 'synthetic.png')
      .expect(401);
    expect(provider.extract).not.toHaveBeenCalled();
  });
  it.each(['userId', 'tenantId', 'imageUrl'])(
    'rejects caller-controlled %s',
    async (field) => {
      const res = await scan(`identity-${field}`)
        .field(field, 'other-customer')
        .attach('images', fixture, 'synthetic.png')
        .expect(400);
      expect(res.body.code).toBe('REGISTRATION_INVALID_UPLOAD');
      expect(provider.extract).not.toHaveBeenCalled();
    },
  );
  it('rejects missing, unsupported, oversized and extra images with safe errors', async () => {
    await scan('no-image').expect(400);
    await scan('fake-image')
      .attach('images', Buffer.from('fake JPEG'), {
        filename: 'fake.jpg',
        contentType: 'image/jpeg',
      })
      .expect(400);
    const large = await scan('large-image')
      .attach(
        'images',
        Buffer.alloc(MAX_REGISTRATION_IMAGE_BYTES + 1),
        'large.jpg',
      )
      .expect(413);
    expect(large.body.code).toBe('REGISTRATION_INVALID_UPLOAD');
    await scan('extra-images')
      .attach('images', fixture, 'one.png')
      .attach('images', fixture, 'two.png')
      .attach('images', fixture, 'three.png')
      .expect(400);
    expect(provider.extract).not.toHaveBeenCalled();
  });
  it('rate limits one customer without consuming another customer’s allowance', async () => {
    for (let i = 0; i < 5; i++)
      await scan('limited-customer')
        .attach('images', fixture, 'synthetic.png')
        .expect(201);
    const res = await scan('limited-customer')
      .attach('images', fixture, 'synthetic.png')
      .expect(429);
    expect(res.body.code).toBe('REGISTRATION_RATE_LIMIT');
    await scan('separate-customer')
      .attach('images', fixture, 'synthetic.png')
      .expect(201);
    expect(provider.extract).toHaveBeenCalledTimes(6);
  });
});
