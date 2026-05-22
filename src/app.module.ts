import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ServicesModule } from './services/services.module';

@Module({
  imports: [AuthModule, ServicesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
