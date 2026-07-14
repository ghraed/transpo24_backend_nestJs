import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { CustomerRequestsModule } from './customer-requests/customer-requests.module';
import { DriverModule } from './driver/driver.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PaymentsModule } from './payments/payments.module';
import { PushTokensModule } from './push-tokens/push-tokens.module';
import { TripsModule } from './trips/trips.module';
import { ServicesModule } from './services/services.module';
import { TranslationModule } from './translations/translations.module';
import { VehiclesModule } from './vehicles/vehicles.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AdminModule,
    AuthModule,
    ChatModule,
    ServicesModule,
    CustomerRequestsModule,
    DriverModule,
    NotificationsModule,
    PaymentsModule,
    PushTokensModule,
    TripsModule,
    TranslationModule,
    VehiclesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
