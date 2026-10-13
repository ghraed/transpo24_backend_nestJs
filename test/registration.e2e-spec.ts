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
import { RegistrationJobStore } from '../src/vehicles/registration/registration-job.store';
import { RegistrationQueueService } from '../src/vehicles/registration/registration-queue.service';
import { RegistrationUploadInterceptor } from '../src/vehicles/registration/registration-upload.interceptor';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RegistrationController } from '../src/vehicles/registration/registration.controller';
import { RegistrationRateLimitGuard } from '../src/vehicles/registration/registration-rate-limit.guard';
import {
  RegistrationService,
  MAX_REGISTRATION_IMAGE_BYTES,
} from '../src/vehicles/registration/registration.service';
import { QwenRegistrationProvider } from '../src/vehicles/registration/qwen-registration.provider';
import { validateExtraction } from '../src/vehicles/registration/registration.schema';
import { syntheticExtraction } from '../src/vehicles/registration/registration.fixtures';

const redisDescribe = process.env.REGISTRATION_TEST_REDIS_PORT
  ? describe
  : describe.skip;
redisDescribe('registration extraction HTTP boundary', () => {
  let app: INestApplication<App>;
  let fixture: Buffer;
  let active = true;
  let storage: string;
  let queue: RegistrationQueueService;
  let store: RegistrationJobStore;
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
    storage = await mkdtemp(join(tmpdir(), 'registration-http-'));
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
        RegistrationJobStore,
        RegistrationQueueService,
        RegistrationUploadInterceptor,
        { provide: AuthService, useValue: auth },
        { provide: QwenRegistrationProvider, useValue: provider },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            REDIS_HOST: '127.0.0.1',
            REDIS_PORT: process.env.REGISTRATION_TEST_REDIS_PORT,
            REGISTRATION_QUEUE_PREFIX: `http-${randomUUID()}`,
            REGISTRATION_STORAGE_DIR: storage,
          }),
        },
      ],
    }).compile();
    app = module.createNestApplication();
    configureHttpApplication(app);
    await app.init();
    queue = app.get(RegistrationQueueService);
    store = app.get(RegistrationJobStore);
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
    await rm(storage, { recursive: true, force: true });
  });
  const scan = (token: string) =>
    request(app.getHttpServer())
      .post('/vehicles/extract-registration')
      .set('Authorization', `Bearer ${token}`);
  const queuedScan = (token: string) =>
    request(app.getHttpServer())
      .post('/vehicles/registration-extractions')
      .set('Authorization', `Bearer ${token}`);
  const poll = async (token: string, id: string) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const res = await request(app.getHttpServer())
        .get(`/vehicles/registration-extractions/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      if (
        !['queued', 'processing'].includes(
          (res.body as { status: string }).status,
        )
      )
        return res;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('Job did not finish');
  };
  it('returns 202 and protects status/cancellation ownership', async () => {
    const res = await queuedScan('async-one')
      .attach('images', fixture, 'card.png')
      .expect(202);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(
      (await poll('async-one', (res.body as { jobId: string }).jobId)).body,
    ).toMatchObject({
      status: 'completed',
      result: { status: 'partial' },
    });
    for (const method of ['get', 'delete'] as const) {
      const denied = await request(app.getHttpServer())
        [method](
          `/vehicles/registration-extractions/${(res.body as { jobId: string }).jobId}`,
        )
        .set('Authorization', 'Bearer async-two')
        .expect(404);
      expect(denied.body.code).toBe('REGISTRATION_NOT_FOUND');
      expect(denied.headers['cache-control']).toBe('private, no-store');
    }
    await request(app.getHttpServer())
      .delete(
        `/vehicles/registration-extractions/${(res.body as { jobId: string }).jobId}`,
      )
      .set('Authorization', 'Bearer async-one')
      .expect(200);
    expect(
      (await queue.status('async-one', (res.body as { jobId: string }).jobId))
        .status,
    ).toBe('cancelled');
  });
  it('streams uploads privately without retaining Multer buffers', async () => {
    const res = await queuedScan('private-upload')
      .attach('images', fixture, 'card.png')
      .expect(202);
    await poll('private-upload', (res.body as { jobId: string }).jobId);
    await queue.sweep();
    expect(await readdir(storage)).toEqual([]);
    expect(await store.outstanding()).toEqual([]);
  });
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
