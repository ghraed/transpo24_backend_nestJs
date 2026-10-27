import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { requestGooglePlaces } from './google-places.transport';
import {
  PlaceAutocompleteDto,
  PlaceDetailsDto,
  PlaceReverseDto,
} from './places.dto';

@Injectable()
export class PlacesService {
  constructor(private readonly config: ConfigService) {}

  private async provider<T>(
    url: URL,
    fields?: string,
    body?: unknown,
  ): Promise<T> {
    const key =
      this.config.get<string>('GOOGLE_MAPS_SERVER_API_KEY')?.trim() ||
      this.config.get<string>('GOOGLE_PLACES_API_KEY')?.trim() ||
      this.config.get<string>('GOOGLE_ROUTES_API_KEY')?.trim();
    if (!key)
      throw new ServiceUnavailableException('Place service is not configured.');
    const headers: Record<string, string> = {};
    if (url.hostname === 'places.googleapis.com') {
      headers['X-Goog-Api-Key'] = key;
      if (fields) headers['X-Goog-FieldMask'] = fields;
    } else {
      url.searchParams.set('key', key);
    }
    try {
      const data = await requestGooglePlaces(url, headers, body);
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Invalid place provider response');
      }
      return data as T;
    } catch {
      throw new BadGatewayException('Place service unavailable.');
    }
  }

  async autocomplete(dto: PlaceAutocompleteDto) {
    const data = await this.provider<{
      suggestions?: {
        placePrediction?: { placeId?: string; text?: { text?: string } };
      }[];
    }>(
      new URL('https://places.googleapis.com/v1/places:autocomplete'),
      'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text',
      { input: dto.input.trim(), languageCode: dto.languageCode ?? 'en' },
    );
    if (data.suggestions !== undefined && !Array.isArray(data.suggestions)) {
      throw new BadGatewayException('Place service unavailable.');
    }
    const predictions = (data.suggestions ?? []).slice(0, 5).flatMap((item) => {
      const prediction = item?.placePrediction;
      return typeof prediction?.placeId === 'string' &&
        typeof prediction.text?.text === 'string'
        ? [{ place_id: prediction.placeId, description: prediction.text.text }]
        : [];
    });
    return { status: predictions.length ? 'OK' : 'ZERO_RESULTS', predictions };
  }

  async details(dto: PlaceDetailsDto) {
    const url = new URL(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(dto.placeId)}`,
    );
    url.searchParams.set('languageCode', dto.languageCode ?? 'en');
    const data = await this.provider<{
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
    }>(url, 'formattedAddress,location');
    const lat = data.location?.latitude;
    const lng = data.location?.longitude;
    if (
      typeof lat !== 'number' ||
      typeof lng !== 'number' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      throw new BadGatewayException('Place service unavailable.');
    }
    return {
      status: 'OK',
      result: {
        formatted_address:
          typeof data.formattedAddress === 'string'
            ? data.formattedAddress
            : '',
        geometry: { location: { lat, lng } },
      },
    };
  }

  async reverse(dto: PlaceReverseDto) {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.search = new URLSearchParams({
      latlng: `${dto.latitude},${dto.longitude}`,
      language: dto.languageCode ?? 'en',
    }).toString();
    const data = await this.provider<{
      status?: string;
      results?: { formatted_address?: string; place_id?: string }[];
      plus_code?: { compound_code?: string; global_code?: string };
    }>(url);
    if (
      !['OK', 'ZERO_RESULTS'].includes(data.status ?? '') ||
      (data.results !== undefined && !Array.isArray(data.results))
    ) {
      throw new BadGatewayException('Place service unavailable.');
    }
    return {
      status: data.status,
      results: (data.results ?? []).slice(0, 1).map((item) => ({
        formatted_address: item.formatted_address,
        place_id: item.place_id,
      })),
      plus_code: data.plus_code
        ? {
            compound_code: data.plus_code.compound_code,
            global_code: data.plus_code.global_code,
          }
        : undefined,
    };
  }
}
