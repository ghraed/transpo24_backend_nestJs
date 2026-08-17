import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import express from 'express';
import { join } from 'node:path';

import { AppModule } from './app.module';
import { configureHttpApplication } from './config/http';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  configureHttpApplication(app);

  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}

void bootstrap();
