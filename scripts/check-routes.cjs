// Read-only provider check. Uses the API environment; never prints credentials or route data.
require('dotenv/config');
const { request } = require('node:https');

const key = process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim() || process.env.GOOGLE_ROUTES_API_KEY?.trim();
if (!key) {
  console.error('Routes check failed: no backend Google Maps key is configured.');
  process.exitCode = 1;
} else {
  // Public sample points, independent of customer and driver location records.
  const body = JSON.stringify({
    origin: { location: { latLng: { latitude: 47.38, longitude: 8.54 } } },
    destination: { location: { latLng: { latitude: 47.4, longitude: 8.6 } } },
    travelMode: 'DRIVE',
  });
  const req = request({
    hostname: 'routes.googleapis.com',
    path: '/directions/v2:computeRoutes',
    method: 'POST',
    family: 4,
    signal: AbortSignal.timeout(10000),
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'routes.polyline.encodedPolyline',
    },
  }, res => {
    let data = '';
    res.setEncoding('utf8');
    res.on('data', chunk => {
      data += chunk;
      if (data.length > 1024 * 1024) res.destroy(new Error('Response too large'));
    });
    res.on('error', () => {
      console.error('Routes check failed: incomplete provider response.');
      process.exitCode = 1;
    });
    res.on('end', () => {
      try {
        const result = JSON.parse(data);
        if (res.statusCode === 200 && result.routes?.some(route => route.polyline?.encodedPolyline)) {
          console.log('Routes check passed: Google returned a driving route with a road polyline.');
          return;
        }
        console.error(`Routes check failed: Google returned HTTP ${res.statusCode}.`);
        const message = typeof result.error?.message === 'string' ? result.error.message : '';
        if (/IP address restriction/i.test(message)) {
          const source = message.match(/originating IP address of the call \((\d{1,3}(?:\.\d{1,3}){3})\)/)?.[1];
          console.error('The backend key does not allow this network’s outbound IP.');
          if (source) console.error(`Observed outbound IPv4: ${source}`);
          console.error('For local development, add this IP to the existing local development key’s IP restrictions in Google Cloud. Keep its API restrictions.');
        } else console.error('Check Routes API enablement, credential restrictions and billing in Google Cloud.');
        process.exitCode = 1;
      } catch {
        console.error('Routes check failed: invalid provider response.');
        process.exitCode = 1;
      }
    });
  });
  req.on('error', () => {
    console.error('Routes check failed: could not reach Google before the request deadline.');
    process.exitCode = 1;
  });
  req.end(body);
}
