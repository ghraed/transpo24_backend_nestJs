import { request } from 'node:https';

// Use the production server's verified, IP-allowlisted IPv4 egress for this
// provider only. TLS certificate/hostname validation retains Node's defaults.
export function requestGoogleRoutes(
  key: string,
  body: unknown,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: 'routes.googleapis.com',
        path: '/directions/v2:computeRoutes',
        method: 'POST',
        family: 4,
        signal: AbortSignal.timeout(8000),
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask':
            'routes.description,routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error('Provider rejected request'));
          return;
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('error', reject);
        res.on('data', (chunk: string) => {
          data += chunk;
          if (data.length > 1024 * 1024) {
            res.destroy();
            reject(new Error('Provider response too large'));
          }
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('Invalid provider response'));
          }
        });
      },
    );
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}
