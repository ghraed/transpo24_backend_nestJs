import {
  Body,
  Controller,
  INestApplication,
  Patch,
  UploadedFiles,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { PickupItemDto } from '../driver/dto/pickup-item.dto';
import { DeliverItemDto } from '../driver/dto/deliver-item.dto';

// Exercise the same multipart parsing and DTO validation as the real proof
// routes, rather than assuming JSON and photo uploads have identical bodies.
@Controller('proof')
class ProofUploadController {
  @Patch('pickup')
  @UseInterceptors(FilesInterceptor('photos'))
  pickup(
    @Body() dto: PickupItemDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return {
      latitude: dto.latitude,
      longitude: dto.longitude,
      photos: files.length,
    };
  }

  @Patch('delivery')
  @UseInterceptors(FilesInterceptor('photos'))
  delivery(
    @Body() dto: DeliverItemDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return {
      latitude: dto.latitude,
      longitude: dto.longitude,
      photos: files.length,
    };
  }
}

let app: INestApplication;
beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [ProofUploadController],
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

it.each(['pickup', 'delivery'])(
  '%s accepts numeric GPS fields alongside a proof photo',
  async (path) => {
    const response = await request(app.getHttpServer() as Server)
      .patch(`/proof/${path}`)
      .field('latitude', '0')
      .field('longitude', '35.5018')
      .attach('photos', Buffer.from('synthetic proof'), 'proof.jpg')
      .expect(200);
    expect(response.body).toEqual({
      latitude: 0,
      longitude: 35.5018,
      photos: 1,
    });
  },
);

it.each(['pickup', 'delivery'])(
  '%s still rejects missing and empty multipart GPS fields',
  async (path) => {
    await request(app.getHttpServer() as Server)
      .patch(`/proof/${path}`)
      .attach('photos', Buffer.from('synthetic proof'), 'proof.jpg')
      .expect(400);
    await request(app.getHttpServer() as Server)
      .patch(`/proof/${path}`)
      .field('latitude', '')
      .field('longitude', '35.5018')
      .attach('photos', Buffer.from('synthetic proof'), 'proof.jpg')
      .expect(400);
  },
);
