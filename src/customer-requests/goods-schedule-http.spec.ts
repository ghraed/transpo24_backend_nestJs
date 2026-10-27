import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { CustomerAuthGuard } from '../auth/guards/customer-auth.guard';
import { configureHttpApplication } from '../config/http';
import { CustomerRequestsController } from './customer-requests.controller';
import { CustomerRequestsService } from './customer-requests.service';
import { FurnitureReservationsService } from './furniture-reservations.service';

describe('goods request scheduling HTTP contract', () => {
  let app: INestApplication;
  const createGoodsTransportRequest = jest
    .fn()
    .mockResolvedValue({ id: 'goods' });
  const payload = {
    shipmentSize: 'S',
    goodsDescription: 'Wasserkocher',
    approximateWeightKg: 1,
    numberOfPieces: 1,
    isFragile: false,
    requiresRefrigeration: false,
    isImmediate: false,
    scheduledPickupAt: '2026-11-01T09:00:00.000Z',
    scheduledDeliveryAt: '2026-11-02T09:00:00.000Z',
    scheduleTimeZone: 'Europe/Zurich',
    pickupLocation: { latitude: 47.47, longitude: 7.59 },
    deliveryLocation: { latitude: 47.49, longitude: 7.62 },
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CustomerRequestsController],
      providers: [
        {
          provide: CustomerRequestsService,
          useValue: { createGoodsTransportRequest },
        },
        { provide: FurnitureReservationsService, useValue: {} },
      ],
    })
      .overrideGuard(CustomerAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          context.switchToHttp().getRequest<{ user: { id: string } }>().user = {
            id: 'customer',
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication({ bodyParser: false });
    configureHttpApplication(app);
    await app.init();
  });

  beforeEach(() => createGoodsTransportRequest.mockClear());
  afterAll(async () => {
    await app?.close();
  });

  it.each([false, true])(
    'accepts delivery and timezone fields for isImmediate=%s',
    async (isImmediate) => {
      await request(app.getHttpServer() as Server)
        .post('/customer/requests/goods-transport')
        .send({
          ...payload,
          isImmediate,
          scheduledPickupAt: isImmediate
            ? undefined
            : payload.scheduledPickupAt,
        })
        .expect(201, { id: 'goods' });

      expect(createGoodsTransportRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'customer',
          isImmediate,
          scheduledPickupAt: isImmediate
            ? undefined
            : new Date(payload.scheduledPickupAt),
          scheduledDeliveryAt: new Date(payload.scheduledDeliveryAt),
          scheduleTimeZone: 'Europe/Zurich',
        }),
      );
    },
  );

  it.each([
    { scheduledDeliveryAt: 'invalid-date' },
    { scheduleTimeZone: 'invalid-zone' },
    { unexpectedField: true },
  ])('rejects invalid input %j before calling the service', async (invalid) => {
    await request(app.getHttpServer() as Server)
      .post('/customer/requests/goods-transport')
      .send({ ...payload, ...invalid })
      .expect(400);

    expect(createGoodsTransportRequest).not.toHaveBeenCalled();
  });
});
