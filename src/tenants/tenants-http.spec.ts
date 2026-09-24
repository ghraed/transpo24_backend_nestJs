import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { CustomerAuthGuard } from '../auth/guards/customer-auth.guard';
import { AuthenticatedUserGuard } from '../auth/guards/authenticated-user.guard';
import { TestingOnlyGuard } from '../auth/guards/testing-only.guard';
import { configureHttpApplication } from '../config/http';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

// Exercise the actual global DTO validation/filter contract used by mobile apps.
describe('tenant HTTP contracts', () => {
  let app: INestApplication<App>;
  const auth = {
    register: jest
      .fn()
      .mockResolvedValue({ message: 'Registration successful.' }),
    registerDriver: jest.fn(),
    login: jest.fn(),
    loginDriver: jest.fn(),
    verifyPhoneCode: jest.fn(),
    verifyDriverPhoneCode: jest.fn(),
    continueDriverSession: jest.fn(),
    updateCustomerProfile: jest.fn(),
    getUserFromAccessToken: jest
      .fn()
      .mockReturnValue({ id: 'user', role: UserRole.CUSTOMER, tenantId: 'fr' }),
    isUserActive: jest.fn().mockResolvedValue(true),
  };
  const markets = [
    {
      id: 'fr',
      code: 'FR',
      countryCode: 'FR',
      name: 'France',
      defaultCurrency: 'EUR',
      timezone: 'Europe/Paris',
      defaultLocale: 'fr-FR',
    },
  ];
  const tenants = { listPublic: jest.fn().mockResolvedValue(markets) };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [TenantsController, AuthController],
      providers: [
        CustomerAuthGuard,
        AuthenticatedUserGuard,
        TestingOnlyGuard,
        { provide: AuthService, useValue: auth },
        { provide: TenantsService, useValue: tenants },
      ],
    }).compile();
    app = module.createNestApplication({ bodyParser: false });
    configureHttpApplication(app);
    await app.init();
  });
  afterAll(async () => app.close());
  beforeEach(() => jest.clearAllMocks());
  it('lists public markets without authentication', async () => {
    const response = await request(app.getHttpServer())
      .get('/tenants/public')
      .expect(200);
    expect(response.body).toEqual(markets);
  });
  it('normalizes selected market on the existing registration endpoint', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        name: 'Name',
        nickname: 'Nickname',
        email: 'customer@example.com',
        password: 'password-123',
        marketCode: ' fr ',
      })
      .expect(201);
    expect(auth.register).toHaveBeenCalledWith(
      expect.objectContaining({ marketCode: 'FR' }),
    );
  });
  it.each(['/auth/login', '/auth/driver/login'])(
    'rejects raw tenant override on %s',
    async (path) => {
      await request(app.getHttpServer())
        .post(path)
        .send({
          email: 'customer@example.com',
          password: 'password-123',
          marketCode: 'FR',
          tenantId: 'lb',
        })
        .expect(400);
      expect(auth.login).not.toHaveBeenCalled();
      expect(auth.loginDriver).not.toHaveBeenCalled();
    },
  );
  it.each([null, '', 'invalid market', 42, {}, 'F'.repeat(33)])(
    'rejects malformed market %p',
    async (marketCode) => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'customer@example.com',
          password: 'password-123',
          marketCode,
        })
        .expect(400);
      expect(auth.login).not.toHaveBeenCalled();
    },
  );
  it('does not use query tenant values as auth context', async () => {
    await request(app.getHttpServer())
      .post('/auth/login?tenantId=lb&marketCode=LB')
      .send({
        email: 'customer@example.com',
        password: 'password-123',
        marketCode: 'FR',
      })
      .expect(201);
    expect(auth.login).toHaveBeenCalledWith(
      expect.objectContaining({ marketCode: 'FR' }),
    );
    expect(auth.login.mock.calls[0][0]).not.toHaveProperty('tenantId');
  });
  it('prevents profile edits of tenant ownership', async () => {
    await request(app.getHttpServer())
      .post('/auth/phone/update-profile')
      .set('Authorization', 'Bearer valid')
      .send({
        name: 'Name',
        nickname: 'Nickname',
        countryCode: 'LB',
        tenantId: 'lb',
      })
      .expect(400);
    expect(auth.updateCustomerProfile).not.toHaveBeenCalled();
  });
  it('forwards selected market when continuing a trusted driver session', async () => {
    await request(app.getHttpServer())
      .post('/auth/driver/session/continue')
      .send({ accessToken: 'trusted', marketCode: 'FR' })
      .expect(201);
    expect(auth.continueDriverSession).toHaveBeenCalledWith('trusted', 'FR');
  });
});
