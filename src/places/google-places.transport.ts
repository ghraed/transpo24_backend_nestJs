import { request } from 'node:https';

// Only server-constructed provider URLs reach this transport. Keep keys and
// provider responses out of errors, and use the server's allowlisted IPv4.
export function requestGooglePlaces(
  url: URL,
  headers: Record<string, string>,
  body?: unknown,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: body === undefined ? 'GET' : 'POST',
        family: 4,
        signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/json', ...headers },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error('Place provider rejected request'));
          return;
        }
        let data = '';
        let bytes = 0;
        res.setEncoding('utf8');
        res.on('error', reject);
        res.on('data', (chunk: string) => {
          bytes += Buffer.byteLength(chunk);
          if (bytes > 1024 * 1024) {
            res.destroy();
            reject(new Error('Place provider response too large'));
            return;
          }
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('Invalid place provider response'));
          }
        });
      },
    );
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
