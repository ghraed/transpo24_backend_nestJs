import { INestApplication, ValidationPipe } from '@nestjs/common';
import express from 'express';
import helmet from 'helmet';

import { JsonExceptionFilter } from '../common/filters/json-exception.filter';

export function parseCorsOrigins(value: string | undefined): true | string[] {
  const origins = value
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins?.length ? origins : true;
}

export function configureHttpApplication(app: INestApplication): void {
  const expressApp = app.getHttpAdapter().getInstance() as express.Express;

  expressApp.disable('x-powered-by');
  if (process.env.TRUST_PROXY === 'true') {
    expressApp.set('trust proxy', 1);
  }

  app.use(helmet());
  app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT ?? '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.enableCors({
    origin: parseCorsOrigins(process.env.CORS_ORIGINS),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new JsonExceptionFilter());
  app.enableShutdownHooks();
}
