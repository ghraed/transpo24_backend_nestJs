import { BadRequestException } from '@nestjs/common';

// Calendar limits use the customer's timezone, including daylight-saving changes.
// Drafts can be incomplete; immediate bicycles can omit the delivery date.
export function assertScheduleWindow({
  immediate,
  pickup,
  delivery,
  furniture = false,
  requireDates = false,
  bicycle = false,
  now = new Date(),
  timeZone = 'UTC',
}: {
  immediate: boolean;
  pickup?: Date;
  delivery?: Date;
  furniture?: boolean;
  requireDates?: boolean;
  bicycle?: boolean;
  now?: Date;
  timeZone?: string;
}) {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    throw new BadRequestException('Invalid schedule timezone.');
  }
  const day = (date: Date) => {
    const parts = formatter.formatToParts(date);
    const part = (type: string) =>
      Number(parts.find((value) => value.type === type)!.value);
    return Date.UTC(part('year'), part('month') - 1, part('day'));
  };
  const today = day(now);
  const end = today + 6 * 86400000;
  const effectivePickup = immediate ? now : pickup;
  if (requireDates && !effectivePickup)
    throw new BadRequestException('Please select a pickup date.');
  if (requireDates && !delivery && !(bicycle && immediate))
    throw new BadRequestException('Please select a delivery date.');
  if (
    effectivePickup &&
    (!Number.isFinite(effectivePickup.getTime()) ||
      (!immediate && effectivePickup < now))
  )
    throw new BadRequestException('Scheduled pickup must be in the future.');
  if (!furniture && effectivePickup && day(effectivePickup) >= end)
    throw new BadRequestException(
      'Pickup must be between today and five days ahead.',
    );
  if (furniture && delivery) {
    if (
      !Number.isFinite(delivery.getTime()) ||
      !effectivePickup ||
      day(delivery) < day(effectivePickup) ||
      day(delivery) > day(effectivePickup) + 5 * 86400000
    )
      throw new BadRequestException(
        'Furniture delivery must be on pickup day or within five days after pickup.',
      );
    return;
  }
  if (!delivery) return;
  if (
    !Number.isFinite(delivery.getTime()) ||
    day(delivery) < today ||
    day(delivery) >= end
  )
    throw new BadRequestException(
      'Delivery must be between today and five days ahead.',
    );
  if (!effectivePickup || day(delivery) <= day(effectivePickup))
    throw new BadRequestException(
      'Delivery date must be after the pickup date.',
    );
}
