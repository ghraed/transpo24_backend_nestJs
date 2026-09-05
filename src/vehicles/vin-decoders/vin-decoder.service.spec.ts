import { ServiceUnavailableException } from '@nestjs/common';

import { OneAutoApiVinDecoder } from './oneautoapi-vin-decoder.service';
import { SwissCarInfoVinDecoder } from './swisscarinfo-vin-decoder.service';
import { VinDecoderService } from './vin-decoder.service';

describe('VinDecoderService', () => {
  const swiss = {
    assertConfigured: jest.fn(),
    decode: jest.fn(),
    decodeRegistrationNumber: jest.fn(),
  };
  const oneAuto = { assertConfigured: jest.fn(), decode: jest.fn() };
  const createService = () =>
    new VinDecoderService(
      swiss as unknown as SwissCarInfoVinDecoder,
      oneAuto as unknown as OneAutoApiVinDecoder,
    );

  beforeEach(() => jest.clearAllMocks());

  it('returns SwissCarInfo data without calling One Auto API', async () => {
    const result = { kind: 'found', data: { source: 'swisscarinfo' } };
    swiss.decode.mockResolvedValue(result);

    await expect(createService().decode('VIN')).resolves.toBe(result);
    expect(swiss.decode).toHaveBeenCalledTimes(1);
    expect(oneAuto.decode).not.toHaveBeenCalled();
  });

  it('calls One Auto API once only after SwissCarInfo returns no result', async () => {
    const fallbackResult = { kind: 'found', data: { source: 'oneautoapi' } };
    swiss.decode.mockResolvedValue({ kind: 'not-found' });
    oneAuto.decode.mockResolvedValue(fallbackResult);

    await expect(createService().decode('VIN')).resolves.toBe(fallbackResult);
    expect(oneAuto.decode).toHaveBeenCalledTimes(1);
  });

  it('uses Swiss registration lookup without calling either VIN lookup', async () => {
    const result = { kind: 'found', data: { source: 'swisscarinfo' } };
    swiss.decodeRegistrationNumber.mockResolvedValue(result);

    await expect(
      createService().decode('VIN', {
        swissRegistrationNumber: '671912676',
      }),
    ).resolves.toBe(result);
    expect(swiss.decodeRegistrationNumber).toHaveBeenCalledWith(
      'VIN',
      '671912676',
    );
    expect(swiss.decode).not.toHaveBeenCalled();
    expect(oneAuto.decode).not.toHaveBeenCalled();
  });

  it('returns not-found when neither provider finds the VIN', async () => {
    swiss.decode.mockResolvedValue({ kind: 'not-found' });
    oneAuto.decode.mockResolvedValue({ kind: 'not-found' });

    await expect(createService().decode('VIN')).resolves.toEqual({
      kind: 'not-found',
    });
  });

  it('does not call One Auto API when SwissCarInfo fails technically', async () => {
    swiss.decode.mockRejectedValue(new ServiceUnavailableException());

    await expect(createService().decode('VIN')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(oneAuto.decode).not.toHaveBeenCalled();
  });

  it('propagates a One Auto API technical failure after a primary miss', async () => {
    swiss.decode.mockResolvedValue({ kind: 'not-found' });
    oneAuto.decode.mockRejectedValue(new ServiceUnavailableException());

    await expect(createService().decode('VIN')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('validates both configurations before making a request', async () => {
    oneAuto.assertConfigured.mockImplementation(() => {
      throw new ServiceUnavailableException();
    });

    await expect(createService().decode('VIN')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(swiss.decode).not.toHaveBeenCalled();
    expect(oneAuto.decode).not.toHaveBeenCalled();
  });
});
