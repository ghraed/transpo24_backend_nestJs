export type RoutePoint = { latitude: number; longitude: number };
const R = 6371;
const rad = (degrees: number) => (degrees * Math.PI) / 180;
function angle(a: RoutePoint, b: RoutePoint) {
  const h =
    Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}
function bearing(a: RoutePoint, b: RoutePoint) {
  const delta = rad(b.longitude - a.longitude);
  return Math.atan2(
    Math.sin(delta) * Math.cos(rad(b.latitude)),
    Math.cos(rad(a.latitude)) * Math.sin(rad(b.latitude)) -
      Math.sin(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.cos(delta),
  );
}
export function distanceToRouteKm(
  point: RoutePoint,
  route: RoutePoint[],
): number {
  let best = Infinity;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i];
    const length = angle(a, b),
      from = angle(a, point);
    const delta = bearing(a, point) - bearing(a, b);
    const along = Math.atan2(Math.sin(from) * Math.cos(delta), Math.cos(from));
    const cross = Math.asin(
      Math.max(-1, Math.min(1, Math.sin(from) * Math.sin(delta))),
    );
    const distance =
      length > 0 && along >= 0 && along <= length
        ? Math.abs(cross)
        : Math.min(from, angle(b, point));
    best = Math.min(best, distance * R);
  }
  return best;
}
