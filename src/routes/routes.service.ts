import { requestGoogleRoutes } from './google-routes.transport';
import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ComputeDriverRouteDto, RoutePointDto } from './routes.dto';

type GoogleRoute = {
  description?: string;
  distanceMeters?: number;
  duration?: string;
  polyline?: { encodedPolyline?: string };
};

@Injectable()
export class RoutesService {
  constructor(private readonly config: ConfigService) {}

  async compute(dto: ComputeDriverRouteDto) {
    const key =
      this.config.get<string>('GOOGLE_MAPS_SERVER_API_KEY')?.trim() ||
      this.config.get<string>('GOOGLE_ROUTES_API_KEY')?.trim();
    if (!key)
      throw new ServiceUnavailableException('Route service is not configured.');
    const waypoint = (point: RoutePointDto) =>
      point.placeId?.trim()
        ? { placeId: point.placeId.trim() }
        : {
            location: {
              latLng: { latitude: point.latitude, longitude: point.longitude },
            },
          };
    try {
      const data = (await requestGoogleRoutes(key, {
        origin: waypoint(dto.origin),
        destination: waypoint(dto.destination),
        travelMode: 'DRIVE',
        computeAlternativeRoutes: dto.alternatives ?? false,
        languageCode: dto.languageCode ?? 'en',
        units: 'METRIC',
      })) as { routes?: GoogleRoute[] };
      if (data.routes !== undefined && !Array.isArray(data.routes))
        throw new Error('Invalid provider response');
      const routes = (data.routes ?? []).slice(0, 3).map((route) => {
        const seconds = Number(route.duration?.replace(/s$/, ''));
        if (
          !route.polyline?.encodedPolyline ||
          !Number.isFinite(seconds) ||
          seconds < 0 ||
          !Number.isFinite(route.distanceMeters) ||
          route.distanceMeters! < 0
        )
          throw new Error('Invalid route');
        return {
          summary: route.description ?? '',
          overview_polyline: { points: route.polyline.encodedPolyline },
          legs: [
            {
              distance: { value: route.distanceMeters! },
              duration: { value: seconds },
            },
          ],
        };
      });
      return { status: routes.length ? 'OK' : 'ZERO_RESULTS', routes };
    } catch {
      // Never expose the provider error, request headers, or server credential.
      throw new BadGatewayException('Routes unavailable.');
    }
  }
}
