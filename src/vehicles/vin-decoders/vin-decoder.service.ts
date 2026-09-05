import { Injectable } from '@nestjs/common';

import { OneAutoApiVinDecoder } from './oneautoapi-vin-decoder.service';
import { SwissCarInfoVinDecoder } from './swisscarinfo-vin-decoder.service';
import { ProviderVinDecodeResult } from './vin-decoder.types';

@Injectable()
export class VinDecoderService {
  constructor(
    private readonly swissCarInfo: SwissCarInfoVinDecoder,
    private readonly oneAutoApi: OneAutoApiVinDecoder,
  ) {}

  async decode(
    vin: string,
    options: { swissRegistrationNumber?: string } = {},
  ): Promise<ProviderVinDecodeResult> {
    if (options.swissRegistrationNumber) {
      this.swissCarInfo.assertConfigured();
      const registrationResult =
        await this.swissCarInfo.decodeRegistrationNumber(
          vin,
          options.swissRegistrationNumber,
        );
      if (registrationResult.kind === 'found') return registrationResult;

      this.oneAutoApi.assertConfigured();
      return this.oneAutoApi.decode(vin);
    }

    // Validate the complete fallback chain before spending either provider's
    // credits, so a partially configured deployment fails deterministically.
    this.swissCarInfo.assertConfigured();
    this.oneAutoApi.assertConfigured();

    const primaryResult = await this.swissCarInfo.decode(vin);
    if (primaryResult.kind === 'found') return primaryResult;
    return this.oneAutoApi.decode(vin);
  }
}
