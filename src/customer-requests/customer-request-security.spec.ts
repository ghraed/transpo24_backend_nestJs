import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuthService } from '../auth/auth.service';
import { CustomerAuthGuard } from '../auth/guards/customer-auth.guard';
import { configureHttpApplication } from '../config/http';
import { CustomerRequestsController } from './customer-requests.controller';
import { CustomerRequestsService } from './customer-requests.service';

// Real HTTP validation, guard, controller and service; identity lookup and DB
// are mocked. Token cryptography is covered separately by tenant-auth.spec.ts.
describe('customer request tenant and ownership isolation', () => {
  let app: INestApplication<App>;
  const row = {
    id: 'foreign-request',
    customerId: 'owner',
    customerTenantId: 'tenant-ch',
    originTenantId: 'tenant-lb',
    status: 'DRAFT',
    serviceId: 'service',
  };
  const db = {
    transportRequest: {
      findUnique: jest.fn().mockResolvedValue(row),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
    },
    driverOffer: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
  };
  const auth = {
    getUserFromAccessToken: jest.fn((token: string) => {
      if (!['owner', 'same-tenant', 'other-tenant'].includes(token))
        return null;
      return {
        id: token,
        role: UserRole.CUSTOMER,
        tenantId: token === 'other-tenant' ? 'tenant-fr' : 'tenant-ch',
      };
    }),
    isUserActive: jest.fn().mockResolvedValue(true),
  };
  const service = new CustomerRequestsService(
    db as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const location = { latitude: 33.89, longitude: 35.5, address: 'Beirut' };
  const edit = {
    serviceId: 'service',
    updatedAt: '2026-09-25T00:00:00.000Z',
    pickupLocation: location,
    dropoffLocation: location,
    retainedPhotoIds: [],
    requiresSpecialWrapping: false,
    requiresDedicatedCarrier: false,
    goodsIsFragile: false,
    goodsRequiresRefrigeration: false,
    furnitureNeedsHelpers: false,
    furnitureCustomerCanHelpLoading: false,
    isImmediate: true,
    requiresLoadingHelp: false,
  };
  beforeAll(async () => {
    db.$transaction.mockImplementation(
      (work: (tx: typeof db) => Promise<unknown>) => work(db),
    );
    const module = await Test.createTestingModule({
      controllers: [CustomerRequestsController],
      providers: [
        CustomerAuthGuard,
        { provide: AuthService, useValue: auth },
        { provide: CustomerRequestsService, useValue: service },
      ],
    }).compile();
    app = module.createNestApplication({ bodyParser: false });
    configureHttpApplication(app);
    await app.init();
  });
  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => app.close());

  it.each(['tenantId', 'customerTenantId', 'originTenantId', 'customerId'])(
    'rejects body override %s before any request write',
    async (field) => {
      const response = await request(app.getHttpServer())
        .post('/customer/requests')
        .set('Authorization', 'Bearer owner')
        .send({ serviceId: 'service', [field]: 'forged' })
        .expect(400);
      expect(JSON.stringify(response.body)).toContain(
        `property ${field} should not exist`,
      );
      expect(db.transportRequest.create).not.toHaveBeenCalled();
    },
  );

  it('rejects tenant overrides inside multipart edit details', async () => {
    await request(app.getHttpServer())
      .post('/customer/requests/foreign-request/edit')
      .set('Authorization', 'Bearer owner')
      .field('details', JSON.stringify({ ...edit, tenantId: 'forged' }))
      .expect(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each(['owner', 'same-tenant', 'other-tenant'])(
    'scopes list to authenticated %s despite forged query and headers',
    async (token) => {
      await request(app.getHttpServer())
        .get('/customer/requests')
        .query({
          tenantId: 'tenant-lb',
          customerTenantId: 'tenant-lb',
          customerId: 'victim',
        })
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-Id', 'tenant-lb')
        .expect(200, []);
      expect(db.transportRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { customerId: token } }),
      );
    },
  );

  const routes: [string, string, Record<string, unknown>][] = [
    ['get', 'status', {}],
    ['get', 'offers', {}],
    ['get', 'tracking', {}],
    ['get', 'edit', {}],
    ['delete', '', {}],
    ['delete', 'photos/photo', {}],
    ['patch', 'pickup-location', location],
    ['patch', 'dropoff-location', location],
    [
      'patch',
      'schedule-and-item-details',
      { isImmediate: true, requiresLoadingHelp: false },
    ],
    ['post', 'submit', {}],
    [
      'post',
      'offers/offer/accept',
      { confirm: true, paymentMethod: 'CREDIT_CARD' },
    ],
    ['post', 'payment/finalize', {}],
  ];
  describe.each(['same-tenant', 'other-tenant'])('%s non-owner', (token) => {
    it.each(routes)(
      'denies %s %s despite forged owner query',
      async (method, suffix, body) => {
        const client = request(app.getHttpServer());
        const path = `/customer/requests/foreign-request${suffix ? `/${suffix}` : ''}`;
        const call =
          method === 'get'
            ? client.get(path)
            : method === 'delete'
              ? client.delete(path)
              : method === 'patch'
                ? client.patch(path)
                : client.post(path);
        await call
          .query({
            customerId: 'owner',
            tenantId: 'tenant-ch',
            customerTenantId: 'tenant-ch',
          })
          .set('Authorization', `Bearer ${token}`)
          .send(body ?? {})
          .expect(403);
        expect(db.transportRequest.update).not.toHaveBeenCalled();
        expect(db.transportRequest.delete).not.toHaveBeenCalled();
        expect(db.driverOffer.findMany).not.toHaveBeenCalled();
      },
    );
    it('denies multipart edits before mutation', async () => {
      await request(app.getHttpServer())
        .post('/customer/requests/foreign-request/edit')
        .set('Authorization', `Bearer ${token}`)
        .field('details', JSON.stringify(edit))
        .expect(403);
      expect(db.transportRequest.update).not.toHaveBeenCalled();
    });
  });

  it('allows owner to read offers for a job outside the home tenant', async () => {
    await request(app.getHttpServer())
      .get('/customer/requests/foreign-request/offers?tenantId=tenant-fr')
      .set('Authorization', 'Bearer owner')
      .expect(200, { requestId: row.id, offers: [] });
    expect(db.driverOffer.findMany).toHaveBeenCalled();
  });
  it('does not authenticate query identity without a bearer token', async () => {
    await request(app.getHttpServer())
      .get('/customer/requests?customerId=owner&tenantId=tenant-ch')
      .expect(401);
    expect(db.transportRequest.findMany).not.toHaveBeenCalled();
  });
});
