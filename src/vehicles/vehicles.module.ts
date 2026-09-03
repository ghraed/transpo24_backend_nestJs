import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { OneAutoApiVinDecoder } from './vin-decoders/oneautoapi-vin-decoder.service';
import { SwissCarInfoVinDecoder } from './vin-decoders/swisscarinfo-vin-decoder.service';
import { VinDecoderService } from './vin-decoders/vin-decoder.service';

@Module({
  imports: [AuthModule],
  controllers: [VehiclesController],
  providers: [
    VehiclesService,
    PrismaService,
    SwissCarInfoVinDecoder,
    OneAutoApiVinDecoder,
    VinDecoderService,
  ],
  exports: [VehiclesService],
})
export class VehiclesModule {}
