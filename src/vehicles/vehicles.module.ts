import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { OneAutoApiVinDecoder } from './vin-decoders/oneautoapi-vin-decoder.service';
import { SwissCarInfoVinDecoder } from './vin-decoders/swisscarinfo-vin-decoder.service';
import { VinDecoderService } from './vin-decoders/vin-decoder.service';
import { TranslationModule } from '../translations/translations.module';
import { RegistrationController } from './registration/registration.controller';
import { RegistrationService } from './registration/registration.service';
import { RegistrationRateLimitGuard } from './registration/registration-rate-limit.guard';
import { QwenRegistrationProvider } from './registration/qwen-registration.provider';
import { RegistrationQueueService } from './registration/registration-queue.service';
import { RegistrationJobStore } from './registration/registration-job.store';
import { RegistrationUploadInterceptor } from './registration/registration-upload.interceptor';

@Module({
  imports: [AuthModule, TranslationModule],
  controllers: [VehiclesController, RegistrationController],
  providers: [
    RegistrationJobStore,
    RegistrationQueueService,
    RegistrationUploadInterceptor,
    RegistrationService,
    RegistrationRateLimitGuard,
    QwenRegistrationProvider,
    VehiclesService,
    PrismaService,
    SwissCarInfoVinDecoder,
    OneAutoApiVinDecoder,
    VinDecoderService,
  ],
  exports: [VehiclesService],
})
export class VehiclesModule {}
