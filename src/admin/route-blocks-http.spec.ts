import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ServiceKey, UserRole } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuthService } from '../auth/auth.service';
import { configureHttpApplication } from '../config/http';
import { RouteBlocksController } from './route-blocks.controller';
import { RouteBlocksService } from './route-blocks.service';
import { RoutePolicyService } from '../route-policy/route-policy.service';

describe('admin route-block HTTP contracts', () => {
  let app: INestApplication<App>;
  const auth = { getUserFromAccessToken: jest.fn(), isUserActive: jest.fn() };
  const blocks = {
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const policy = { findBlock: jest.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [RouteBlocksController],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: RouteBlocksService, useValue: blocks },
        { provide: RoutePolicyService, useValue: policy },
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
      id: 'admin',
      role: UserRole.ADMIN,
    });
    auth.isUserActive.mockResolvedValue(true);
    policy.findBlock.mockResolvedValue(null);
  });
  const endpoints = [
    ['get', '/admin/route-blocks'],
    ['get', '/admin/route-blocks/id'],
    ['post', '/admin/route-blocks'],
    ['patch', '/admin/route-blocks/id'],
    ['delete', '/admin/route-blocks/id'],
    ['get', '/admin/route-policy/check'],
  ] as const;
  it.each(endpoints)(
    '%s %s requires authentication and ADMIN role',
    async (method, path) => {
      await request(app.getHttpServer())[method](path).expect(401);
      for (const role of [UserRole.CUSTOMER, UserRole.DRIVER]) {
        auth.getUserFromAccessToken.mockReturnValue({ id: 'user', role });
        await request(app.getHttpServer())
          [method](path)
          .set('Authorization', 'Bearer token')
          .expect(403);
      }
      auth.getUserFromAccessToken.mockReturnValue({
        id: 'admin',
        role: UserRole.ADMIN,
      });
      auth.isUserActive.mockResolvedValue(false);
      await request(app.getHttpServer())
        [method](path)
        .set('Authorization', 'Bearer token')
        .expect(401);
      expect(blocks.create).not.toHaveBeenCalled();
      expect(blocks.update).not.toHaveBeenCalled();
    },
  );
  it('normalizes countries and derives actor from authenticated identity', async () => {
    await request(app.getHttpServer())
      .post('/admin/route-blocks')
      .set('Authorization', 'Bearer token')
      .send({
        fromCountryCode: ' lb ',
        toCountryCode: 'sy',
        transportType: null,
      })
      .expect(201);
    expect(blocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        fromCountryCode: 'LB',
        toCountryCode: 'SY',
        transportType: null,
      }),
      'admin',
    );
  });
  it.each([
    { fromCountryCode: 'ZZ' },
    { toCountryCode: null },
    { transportType: 'BOAT' },
    { reason: 'x'.repeat(1001) },
    { reason: 123 },
    { isActive: null },
    { isActive: 'false' },
    { createdByAdminId: 'forged' },
  ])('rejects invalid create data %j', async (invalid) => {
    await request(app.getHttpServer())
      .post('/admin/route-blocks')
      .set('Authorization', 'Bearer token')
      .send({ fromCountryCode: 'FR', toCountryCode: 'CH', ...invalid })
      .expect(400);
    expect(blocks.create).not.toHaveBeenCalled();
  });
  it('validates partial updates, permits clearing reason/type, and soft-deletes', async () => {
    await request(app.getHttpServer())
      .patch('/admin/route-blocks/id')
      .set('Authorization', 'Bearer token')
      .send({ fromCountryCode: null })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/admin/route-blocks/id')
      .set('Authorization', 'Bearer token')
      .send({ transportType: null, reason: null, isActive: true })
      .expect(200);
    expect(blocks.update).toHaveBeenCalledWith(
      'id',
      { transportType: null, reason: null, isActive: true },
      'admin',
    );
    await request(app.getHttpServer())
      .delete('/admin/route-blocks/id')
      .set('Authorization', 'Bearer token')
      .expect(200);
    expect(blocks.update).toHaveBeenLastCalledWith(
      'id',
      { isActive: false },
      'admin',
    );
  });
  it('parses false filters and bounds pagination', async () => {
    await request(app.getHttpServer())
      .get('/admin/route-blocks?isActive=false&page=2&limit=10')
      .set('Authorization', 'Bearer token')
      .expect(200);
    expect(blocks.list).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false, page: 2, limit: 10 }),
    );
    for (const query of [
      'limit=101',
      'page=0',
      'isActive=invalid',
      'fromCountryCode=ZZ',
    ]) {
      await request(app.getHttpServer())
        .get('/admin/route-blocks?' + query)
        .set('Authorization', 'Bearer token')
        .expect(400);
    }
  });
  it('returns effective policy from the shared service only to admins', async () => {
    const path =
      '/admin/route-policy/check?from=fr&to=ch&type=' +
      ServiceKey.FURNITURE_TRANSPORT;
    let response = await request(app.getHttpServer())
      .get(path)
      .set('Authorization', 'Bearer token')
      .expect(200);
    expect(response.body.allowed).toBe(true);
    policy.findBlock.mockResolvedValue({
      id: 'block',
      reason: 'internal reason',
    });
    response = await request(app.getHttpServer())
      .get(path)
      .set('Authorization', 'Bearer token')
      .expect(200);
    expect(response.body).toMatchObject({
      fromCountryCode: 'FR',
      toCountryCode: 'CH',
      allowed: false,
      blockedBy: { id: 'block', reason: 'internal reason' },
    });
    await request(app.getHttpServer())
      .get('/admin/route-policy/check?from=FR&to=CH')
      .set('Authorization', 'Bearer token')
      .expect(400);
  });
});
