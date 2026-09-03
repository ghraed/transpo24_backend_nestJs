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
        variant: decoded.trim,
        manufactureYear: 2003,
        estimatedWeightKg: decoded.estimatedWeightKg,
        bodyType: decoded.bodyClass,
        make: decoded.make,
        year: decoded.year,
        trim: decoded.trim,
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
        errorCode: null,
        errorText: null,
        source: decoded.source,
      },
    });
    expect(vinDecoder.decode).toHaveBeenCalledWith('1HGCM82633A004352');
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
});
