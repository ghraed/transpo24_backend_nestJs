import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { EDITABLE_REQUEST_FIELDS } from '../customer-requests/editable-request-fields';

const VERSION_FIELDS = [
  'id',
  ...EDITABLE_REQUEST_FIELDS,
  'pickupLatitude',
  'pickupLongitude',
  'pickupAddress',
  'pickupPlaceId',
  'dropoffLatitude',
  'dropoffLongitude',
  'dropoffAddress',
  'dropoffPlaceId',
] as const;

export const REQUEST_VERSION_SELECT = Object.fromEntries(
  VERSION_FIELDS.map((key) => [key, true]),
) as {
  [K in (typeof VERSION_FIELDS)[number]]: true;
} satisfies Prisma.TransportRequestSelect;

type VersionSource = Prisma.TransportRequestGetPayload<{
  select: typeof REQUEST_VERSION_SELECT;
}>;

// Hash the snapshot returned to the driver, excluding offer/alert/status changes.
export function requestDetailsVersion(
  request: VersionSource & {
    photos: { id: string; url: string; sortOrder: number }[];
  },
): string {
  const values = VERSION_FIELDS.map((key) => [key, request[key]]);
  const photos = request.photos
    .map(({ id, url, sortOrder }) => ({ id, url, sortOrder }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  return createHash('sha256')
    .update(JSON.stringify({ values, photos }))
    .digest('hex');
}

export type RequestVersionSource = VersionSource;
