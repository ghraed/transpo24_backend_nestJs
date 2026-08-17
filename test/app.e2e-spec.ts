import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PushApp, PushPlatform, UserRole } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import type { AuthenticatedUser } from '../src/auth/auth.types';
import { AuthenticatedUserGuard } from '../src/auth/guards/authenticated-user.guard';
import { CustomerAuthGuard } from '../src/auth/guards/customer-auth.guard';
import { TestingOnlyGuard } from '../src/auth/guards/testing-only.guard';
import { configureHttpApplication } from '../src/config/http';
import { HealthController } from '../src/health/health.controller';
import { HealthService } from '../src/health/health.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { PushTokensController } from '../src/push-tokens/push-tokens.controller';
import { PushTokensService } from '../src/push-tokens/push-tokens.service';
import { PaymentsController } from '../src/payments/payments.controller';
import { PaymentsService } from '../src/payments/payments.service';
import { TripsGateway } from '../src/trips/trips.gateway';
import { CustomerRequestsService } from '../src/customer-requests/customer-requests.service';
import { ServicesController } from '../src/services/services.controller';
import { ServicesService } from '../src/services/services.service';

describe('API HTTP contract (e2e)', () => {
  let app: INestApplication<App>;

  const customer: AuthenticatedUser = {
    id: 'customer-1',
    name: 'Customer',
    email: 'customer@example.com',
    role: UserRole.CUSTOMER,
    hasDriverProfile: false,
  };
  const driver: AuthenticatedUser = {
    id: 'driver-1',
    name: 'Driver',
    email: 'driver@example.com',
    role: UserRole.DRIVER,
    hasDriverProfile: true,
  };
  const authService = {
    register: jest.fn(),
    registerDriver: jest.fn(),
    loginDriver: jest.fn(),
    sendDriverPhoneCode: jest.fn(),
    verifyDriverPhoneCode: jest.fn(),
    continueDriverSession: jest.fn(),
    login: jest.fn(),
    loginAdmin: jest.fn(),
    resetUsersForTesting: jest.fn(),
    resetDriversForTesting: jest.fn(),
    sendPhoneCode: jest.fn(),
    verifyPhoneCode: jest.fn(),
    refreshCustomerSession: jest.fn(),
    logoutCustomer: jest.fn(),
    completeCustomerProfile: jest.fn(),
    updateCustomerProfile: jest.fn(),
    getUserFromAccessToken: jest.fn(),
  };
  const servicesService = { listActiveServices: jest.fn() };
  const pushTokensService = { registerToken: jest.fn() };
  const paymentsService = { handleStripeWebhook: jest.fn() };
  const originalNodeEnv = process.env.NODE_ENV;
  const originalCorsOrigins = process.env.CORS_ORIGINS;
  const originalTestReset = process.env.ENABLE_TEST_ENDPOINTS;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.CORS_ORIGINS =
      'https://app.example.com,https://admin.example.com';
    delete process.env.ENABLE_TEST_ENDPOINTS;

    const moduleFixture = await Test.createTestingModule({
      controllers: [
        AppController,
        AuthController,
        ServicesController,
        PushTokensController,
        HealthController,
        PaymentsController,
      ],
      providers: [
        AppService,
        AuthenticatedUserGuard,
        CustomerAuthGuard,
        TestingOnlyGuard,
        HealthService,
        { provide: AuthService, useValue: authService },
        { provide: ServicesService, useValue: servicesService },
        { provide: PushTokensService, useValue: pushTokensService },
        { provide: PaymentsService, useValue: paymentsService },
        { provide: TripsGateway, useValue: {} },
        { provide: CustomerRequestsService, useValue: {} },
        { provide: PrismaService, useValue: { $queryRaw: jest.fn() } },
      ],
    }).compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    configureHttpApplication(app);
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ENABLE_TEST_ENDPOINTS;
    process.env.NODE_ENV = 'test';
    authService.getUserFromAccessToken.mockImplementation((token: string) => {
      if (token === 'customer-token') return customer;
      if (token === 'driver-token') return driver;
      return null;
    });
    authService.register.mockResolvedValue({
      message: 'Registration successful.',
      user: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        role: customer.role,
      },
    });
    servicesService.listActiveServices.mockResolvedValue([
      { id: 'service-1', key: 'goods', isActive: true, sortOrder: 1 },
    ]);
    pushTokensService.registerToken.mockResolvedValue({ success: true });
    paymentsService.handleStripeWebhook.mockResolvedValue({
      received: true,
      type: 'payment_intent.succeeded',
    });
  });

  afterAll(async () => {
    await app.close();
    process.env.NODE_ENV = originalNodeEnv;
    process.env.CORS_ORIGINS = originalCorsOrigins;
    process.env.ENABLE_TEST_ENDPOINTS = originalTestReset;
  });

  it('serves the root endpoint with API security headers', async () => {
    const response = await request(app.getHttpServer()).get('/').expect(200);

    expect(response.text).toBe('Hello World!');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
  });

  it('exposes load-balancer liveness and database readiness probes', async () => {
    const live = await request(app.getHttpServer())
      .get('/health/live')
      .expect(200);
    const ready = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200);

    expect(live.body).toMatchObject({ status: 'ok' });
    expect(ready.body).toMatchObject({ status: 'ok' });
  });

  it('accepts a valid public registration contract', async () => {
    const payload = {
      name: 'Test Customer',
      email: 'customer@example.com',
      password: 'strong-password',
    };

    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send(payload)
      .expect(201);

    const body = response.body as { message: string };
    expect(body.message).toBe('Registration successful.');
    expect(authService.register).toHaveBeenCalledWith(payload);
  });

  it('rejects invalid and unknown request fields with a stable JSON error', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        name: '',
        email: 'not-an-email',
        password: 'short',
        isAdmin: true,
      })
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      path: '/auth/register',
    });
    const body = response.body as { message: string; timestamp: string };
    expect(body.message).toContain('property isAdmin should not exist');
    expect(body.timestamp).toEqual(expect.any(String));
    expect(authService.register).not.toHaveBeenCalled();
  });

  it('does not expose unexpected internal error details', async () => {
    authService.register.mockRejectedValueOnce(
      new Error('database password=super-secret'),
    );

    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        name: 'Test Customer',
        email: 'customer@example.com',
        password: 'strong-password',
      })
      .expect(500);

    expect(response.body).toMatchObject({
      statusCode: 500,
      message: 'Unexpected server error.',
      error: 'Internal Server Error',
      path: '/auth/register',
    });
    expect(JSON.stringify(response.body)).not.toContain('super-secret');
  });

  it('rejects missing and invalid access tokens', async () => {
    await request(app.getHttpServer()).get('/services').expect(401);
    await request(app.getHttpServer())
      .get('/services')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
  });

  it('enforces the customer role and forwards the authenticated request', async () => {
    await request(app.getHttpServer())
      .get('/services')
      .set('Authorization', 'Bearer driver-token')
      .expect(403);

    const response = await request(app.getHttpServer())
      .get('/services')
      .set('Authorization', 'Bearer customer-token')
      .expect(200);

    const body = response.body as { services: unknown[] };
    expect(body.services).toHaveLength(1);
    expect(servicesService.listActiveServices).toHaveBeenCalledTimes(1);
  });

  it('validates an authenticated push-token payload before service dispatch', async () => {
    await request(app.getHttpServer())
      .post('/push-tokens')
      .set('Authorization', 'Bearer driver-token')
      .send({ token: '', app: 'UNKNOWN', platform: 'desktop' })
      .expect(400);
    expect(pushTokensService.registerToken).not.toHaveBeenCalled();

    await request(app.getHttpServer())
      .post('/push-tokens')
      .set('Authorization', 'Bearer driver-token')
      .send({
        token: 'ExponentPushToken[abc123]',
        app: PushApp.DRIVER,
        platform: PushPlatform.android,
        deviceName: 'Pixel',
      })
      .expect(201, { success: true });

    expect(pushTokensService.registerToken).toHaveBeenCalledWith({
      userId: driver.id,
      role: driver.role,
      hasDriverProfile: true,
      token: 'ExponentPushToken[abc123]',
      app: PushApp.DRIVER,
      platform: PushPlatform.android,
      deviceName: 'Pixel',
    });
  });

  it('honors the configured CORS allowlist', async () => {
    const allowed = await request(app.getHttpServer())
      .options('/services')
      .set('Origin', 'https://app.example.com')
      .set('Access-Control-Request-Method', 'GET')
      .expect(204);
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'https://app.example.com',
    );
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const untrusted = await request(app.getHttpServer())
      .options('/services')
      .set('Origin', 'https://evil.example.com')
      .set('Access-Control-Request-Method', 'GET')
      .expect(204);
    expect(untrusted.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('preserves raw Stripe webhook bytes and requires a signature', async () => {
    const rawPayload = '{"id":"evt_123","type":"payment_intent.succeeded"}';

    await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .send(rawPayload)
      .expect(400);
    expect(paymentsService.handleStripeWebhook).not.toHaveBeenCalled();

    await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', 'test-signature')
      .send(rawPayload)
      .expect(201, {
        received: true,
        type: 'payment_intent.succeeded',
      });

    const [body, signature] = paymentsService.handleStripeWebhook.mock
      .calls[0] as [Buffer, string];
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(body.toString('utf8')).toBe(rawPayload);
    expect(signature).toBe('test-signature');
  });

  it('keeps destructive testing routes disabled unless explicitly opted in', async () => {
    await request(app.getHttpServer())
      .post('/auth/testing/reset-users')
      .expect(404);
    expect(authService.resetUsersForTesting).not.toHaveBeenCalled();

    process.env.ENABLE_TEST_ENDPOINTS = 'true';
    authService.resetUsersForTesting.mockResolvedValue({
      deletedUsers: 2,
      keptEmail: 'driver@test.com',
    });
    await request(app.getHttpServer())
      .post('/auth/testing/reset-users')
      .expect(201, { deletedUsers: 2, keptEmail: 'driver@test.com' });
  });

  it('never exposes destructive testing routes in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_TEST_ENDPOINTS = 'true';

    await request(app.getHttpServer())
      .post('/auth/testing/reset-drivers')
      .expect(404);
    expect(authService.resetDriversForTesting).not.toHaveBeenCalled();
  });
});
