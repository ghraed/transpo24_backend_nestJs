import { BadRequestException } from '@nestjs/common';

import { VinDecoderService } from './vin-decoders/vin-decoder.service';
import { NormalizedVinData } from './vin-decoders/vin-decoder.types';
import { VehiclesService } from './vehicles.service';

describe('VehiclesService', () => {
  const prisma = {
    vehicleBrand: { findFirst: jest.fn() },
    vehicleModel: { findFirst: jest.fn() },
    vehicleSeries: { findFirst: jest.fn() },
  };
  const vinDecoder = { decode: jest.fn() };
  const createService = () =>
    new VehiclesService(
      prisma as never,
      vinDecoder as unknown as VinDecoderService,
    );

  beforeEach(() => jest.clearAllMocks());

  it('normalizes the VIN and preserves the mobile response fields', async () => {
    const decoded: NormalizedVinData = {
      vin: '1HGCM82633A004352',
      make: 'HONDA',
      model: 'Accord',
      year: '2003',
      trim: 'EX',
      variant: 'CM5',
      vehicleType: 'Passenger Car',
      bodyClass: 'Sedan',
      manufacturer: 'Honda',
      plantCountry: null,
      engineCylinders: '4',
      displacementL: '2.4',
      fuelTypePrimary: 'Petrol',
      transmissionStyle: 'Automatic',
      driveType: 'FWD',
      doors: '4',
      series: 'Accord VII',
      estimatedWeightKg: 1450,
      grossWeightKg: 1950,
      payloadKg: 500,
      enginePowerKw: 118,
      enginePowerHp: 160,
      engineTorqueNm: 220,
      lengthMm: 4813,
      widthMm: 1816,
      heightMm: 1455,
      wheelbaseMm: 2740,
      seats: 5,
      maxSpeedKmh: 210,
      brakedTowingKg: 1500,
      unbrakedTowingKg: 500,
      co2CombinedGKm: 190,
      fuelConsumptionCombinedL100Km: 8.2,
      euroStandard: 'Euro 4',
      color: 'Black',
      source: 'swisscarinfo',
    };
    vinDecoder.decode.mockResolvedValue({ kind: 'found', data: decoded });

    await expect(
      createService().decodeVin(' 1hgcm82633a004352 '),
    ).resolves.toEqual({
      success: true,
      source: 'VIN_API',
      requiresManualSelection: false,
      message: undefined,
      data: {
        vin: decoded.vin,
        brand: decoded.make,
        model: decoded.model,
        series: decoded.series,
        variant: decoded.variant,
        manufactureYear: 2003,
        estimatedWeightKg: decoded.estimatedWeightKg,
        bodyType: decoded.bodyClass,
        make: decoded.make,
        year: decoded.year,
        trim: decoded.trim,
        variantCode: decoded.variant,
        vehicleType: decoded.vehicleType,
        bodyClass: decoded.bodyClass,
        manufacturer: decoded.manufacturer,
        plantCountry: decoded.plantCountry,
        engineCylinders: decoded.engineCylinders,
        displacementL: decoded.displacementL,
        fuelTypePrimary: decoded.fuelTypePrimary,
        transmissionStyle: decoded.transmissionStyle,
        driveType: decoded.driveType,
        doors: decoded.doors,
        grossWeightKg: decoded.grossWeightKg,
        payloadKg: decoded.payloadKg,
        enginePowerKw: decoded.enginePowerKw,
        enginePowerHp: decoded.enginePowerHp,
        engineTorqueNm: decoded.engineTorqueNm,
        lengthMm: decoded.lengthMm,
        widthMm: decoded.widthMm,
        heightMm: decoded.heightMm,
        wheelbaseMm: decoded.wheelbaseMm,
        seats: decoded.seats,
        maxSpeedKmh: decoded.maxSpeedKmh,
        brakedTowingKg: decoded.brakedTowingKg,
        unbrakedTowingKg: decoded.unbrakedTowingKg,
        co2CombinedGKm: decoded.co2CombinedGKm,
        fuelConsumptionCombinedL100Km: decoded.fuelConsumptionCombinedL100Km,
        euroStandard: decoded.euroStandard,
        color: decoded.color,
        errorCode: null,
        errorText: null,
        source: decoded.source,
      },
    });
    expect(vinDecoder.decode).toHaveBeenCalledWith('1HGCM82633A004352', {
      swissRegistrationNumber: undefined,
    });
  });

  it('returns the existing controlled vehicle-not-found response', async () => {
    vinDecoder.decode.mockResolvedValue({ kind: 'not-found' });

    await expect(
      createService().decodeVin('1HGCM82633A004352'),
    ).resolves.toEqual({
      success: false,
      source: 'VIN_API',
      requiresManualSelection: true,
      message:
        'Vehicle details could not be fetched from the VIN. Please select vehicle details manually.',
      data: null,
    });
  });

  it('rejects an invalid VIN before either provider can be called', async () => {
    const service = createService();

    await expect(service.decodeVin('abc123')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.decodeVin('1HGCM82633A00435I')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(vinDecoder.decode).not.toHaveBeenCalled();
  });

  it('normalizes and validates an optional Swiss registration number', async () => {
    vinDecoder.decode.mockResolvedValue({ kind: 'not-found' });

    await createService().decodeVin('1HGCM82633A004352', '671.912.676');
    expect(vinDecoder.decode).toHaveBeenCalledWith('1HGCM82633A004352', {
      swissRegistrationNumber: '671912676',
    });

    await expect(
      createService().decodeVin('1HGCM82633A004352', '12345'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
