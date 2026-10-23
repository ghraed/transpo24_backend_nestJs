import { distanceToRouteKm } from './route-distance';

describe('pickup distance to the selected route', () => {
  const route = [
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 2 },
  ];
  it('measures the segment interior rather than only endpoints or driver GPS', () => {
    expect(distanceToRouteKm({ latitude: 0, longitude: 1 }, route)).toBeCloseTo(
      0,
    );
    expect(
      distanceToRouteKm({ latitude: 0.01, longitude: 1 }, route),
    ).toBeCloseTo(1.1119, 3);
    expect(
      distanceToRouteKm({ latitude: 0.1, longitude: 1 }, route),
    ).toBeGreaterThan(10);
  });
  it('does not extend the route infinitely beyond its endpoints', () => {
    expect(distanceToRouteKm({ latitude: 0, longitude: 3 }, route)).toBeCloseTo(
      111.195,
      2,
    );
  });
  it('handles duplicate points and bends', () => {
    expect(
      distanceToRouteKm({ latitude: 1, longitude: 2 }, [
        ...route,
        route[1],
        { latitude: 2, longitude: 2 },
      ]),
    ).toBeCloseTo(0);
  });
  it('handles the international date line', () => {
    expect(
      distanceToRouteKm({ latitude: 0, longitude: 180 }, [
        { latitude: 0, longitude: 179 },
        { latitude: 0, longitude: -179 },
      ]),
    ).toBeCloseTo(0);
  });
});
