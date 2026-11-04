import 'dotenv/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { configureHttpApplication } from './config/http';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  configureHttpApplication(app);

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}

void bootstrap();
