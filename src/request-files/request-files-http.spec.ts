import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { RequestFilesController } from './request-files.controller';
import { RequestFilesService } from './request-files.service';
import { PrismaService } from '../prisma/prisma.service';

describe('private file HTTP boundary', () => {
  let app: INestApplication;
  const pdf = Buffer.from('%PDF-1.7\nprivate');
  beforeAll(async () => {
    const prisma = {
      transportRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'r',
          customerId: 'customer',
          assignedDriverId: 'd',
          assignedDriver: { userId: 'driver' },
          acceptedOfferId: 'o',
          acceptedOffer: { driverId: 'd' },
          service: { key: 'VEHICLE_TRANSPORT' },
        }),
      },
      requestFile: {
        findUnique: jest.fn().mockResolvedValue({
          requestId: 'r',
          mimeType: 'application/pdf',
          fileName: 'contract.pdf',
          size: pdf.length,
          data: pdf,
        }),
      },
    };
    const module = await Test.createTestingModule({
      controllers: [RequestFilesController],
      providers: [
        RequestFilesService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: AuthService,
          useValue: {
            getUserFromAccessToken: (token: string) =>
              ['customer', 'driver', 'admin', 'stranger'].includes(token)
                ? {
                    id: token,
                    role:
                      token === 'admin'
                        ? 'ADMIN'
                        : token === 'driver'
                          ? 'DRIVER'
                          : 'CUSTOMER',
                  }
                : null,
            isUserActive: async () => true,
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  it('requires a valid Bearer token', async () => {
    await request(app.getHttpServer() as Server)
      .get('/request-files/file/content')
      .expect(401);
    await request(app.getHttpServer() as Server)
      .get('/request-files/file/content')
      .set('Authorization', 'Bearer invalid')
      .expect(401);
  });
  it('blocks an unrelated authenticated customer', async () => {
    await request(app.getHttpServer() as Server)
      .get('/request-files/file/content')
      .set('Authorization', 'Bearer stranger')
      .expect(403);
  });
  it.each(['customer', 'driver', 'admin'])(
    'streams private bytes to %s without public caching',
    async (actor) => {
      const response = await request(app.getHttpServer() as Server)
        .get('/request-files/file/content')
        .set('Authorization', `Bearer ${actor}`)
        .expect(200);
      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.headers['content-disposition']).toContain('attachment;');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.body).toEqual(pdf);
    },
  );
});
