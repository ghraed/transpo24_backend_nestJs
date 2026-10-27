import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as transport from './google-places.transport';
import { PlacesService } from './places.service';

jest.mock('./google-places.transport');
const provider = jest.mocked(transport.requestGooglePlaces);
const service = new PlacesService({
  get: () => 'server-secret',
} as unknown as ConfigService);
beforeEach(() => jest.resetAllMocks());

it('uses one shared server key for Places and Geocoding', async () => {
  const shared = new PlacesService({
    get: (name: string) =>
      name === 'GOOGLE_MAPS_SERVER_API_KEY' ? 'shared-key' : 'old-key',
  } as unknown as ConfigService);
  provider.mockResolvedValueOnce({ suggestions: [] });
  await shared.autocomplete({ input: 'Basel' });
  expect(provider.mock.calls[0][1]['X-Goog-Api-Key']).toBe('shared-key');
  provider.mockResolvedValueOnce({ status: 'ZERO_RESULTS', results: [] });
  await shared.reverse({ latitude: 47.56, longitude: 7.59 });
  expect(provider.mock.calls[1][0].searchParams.get('key')).toBe('shared-key');
});

it('reuses the existing Routes key without requiring an additional credential', async () => {
  const shared = new PlacesService({
    get: (name: string) =>
      name === 'GOOGLE_ROUTES_API_KEY' ? 'existing-key' : undefined,
  } as unknown as ConfigService);
  provider.mockResolvedValue({ suggestions: [] });
  await shared.autocomplete({ input: 'Basel' });
  expect(provider.mock.calls[0][1]['X-Goog-Api-Key']).toBe('existing-key');
});

it('uses server-authenticated Places New search and returns only predictions', async () => {
  provider.mockResolvedValue({
    suggestions: [
      {
        placePrediction: {
          placeId: 'basel-id',
          text: { text: 'Steinweg, Basel' },
          privateField: 'unused',
        },
      },
      { queryPrediction: {} },
    ],
  });
  await expect(
    service.autocomplete({ input: ' Steinweg ', languageCode: 'de' }),
  ).resolves.toEqual({
    status: 'OK',
    predictions: [{ place_id: 'basel-id', description: 'Steinweg, Basel' }],
  });
  const [url, headers, body] = provider.mock.calls[0];
  expect(url.href).toBe('https://places.googleapis.com/v1/places:autocomplete');
  expect(headers).toEqual({
    'X-Goog-Api-Key': 'server-secret',
    'X-Goog-FieldMask':
      'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text',
  });
  expect(body).toEqual({ input: 'Steinweg', languageCode: 'de' });
});

it('supports empty search results and rejects malformed predictions', async () => {
  provider.mockResolvedValueOnce({});
  await expect(service.autocomplete({ input: 'unknown' })).resolves.toEqual({
    status: 'ZERO_RESULTS',
    predictions: [],
  });
  provider.mockResolvedValueOnce({ suggestions: 'invalid' });
  await expect(service.autocomplete({ input: 'Basel' })).rejects.toBeInstanceOf(
    BadGatewayException,
  );
});

it('converts details to the existing mobile location contract', async () => {
  provider.mockResolvedValue({
    formattedAddress: 'Steinweg, Basel',
    location: { latitude: 47.56, longitude: 7.59 },
    unused: true,
  });
  await expect(
    service.details({ placeId: 'basel-id', languageCode: 'de' }),
  ).resolves.toEqual({
    status: 'OK',
    result: {
      formatted_address: 'Steinweg, Basel',
      geometry: { location: { lat: 47.56, lng: 7.59 } },
    },
  });
  expect(provider.mock.calls[0][0].href).toBe(
    'https://places.googleapis.com/v1/places/basel-id?languageCode=de',
  );
  expect(provider.mock.calls[0][1]['X-Goog-FieldMask']).toBe(
    'formattedAddress,location',
  );
});

it.each([
  {},
  { location: { latitude: 100, longitude: 7 } },
  { location: { latitude: 47, longitude: NaN } },
])('rejects missing or invalid provider coordinates: %j', async (data) => {
  provider.mockResolvedValue(data);
  await expect(service.details({ placeId: 'basel-id' })).rejects.toBeInstanceOf(
    BadGatewayException,
  );
});

it('reverse geocodes with the server key and filters provider data', async () => {
  provider.mockResolvedValue({
    status: 'OK',
    results: [{ formatted_address: 'Basel', place_id: 'id', unused: true }],
  });
  const result = await service.reverse({ latitude: 47.56, longitude: 7.59 });
  expect(result).toEqual({
    status: 'OK',
    results: [{ formatted_address: 'Basel', place_id: 'id' }],
  });
  expect(provider.mock.calls[0][0].searchParams.get('key')).toBe(
    'server-secret',
  );
  expect(JSON.stringify(result)).not.toContain('server-secret');
});

it('preserves no-address and plus-code responses', async () => {
  provider.mockResolvedValue({
    status: 'ZERO_RESULTS',
    results: [],
    plus_code: { compound_code: 'ABCD Basel' },
  });
  await expect(
    service.reverse({ latitude: 47.56, longitude: 7.59 }),
  ).resolves.toMatchObject({
    status: 'ZERO_RESULTS',
    results: [],
    plus_code: { compound_code: 'ABCD Basel' },
  });
});

it('hides upstream errors and fails explicitly when not configured', async () => {
  provider.mockRejectedValue(new Error('Provider detail server-secret'));
  await expect(service.autocomplete({ input: 'Basel' })).rejects.toThrow(
    'Place service unavailable.',
  );
  provider.mockResolvedValue({
    status: 'REQUEST_DENIED',
    error_message: 'server-secret',
  });
  await expect(service.reverse({ latitude: 47, longitude: 7 })).rejects.toThrow(
    'Place service unavailable.',
  );
  const missing = new PlacesService({
    get: () => '',
  } as unknown as ConfigService);
  await expect(missing.autocomplete({ input: 'Basel' })).rejects.toBeInstanceOf(
    ServiceUnavailableException,
  );
});
