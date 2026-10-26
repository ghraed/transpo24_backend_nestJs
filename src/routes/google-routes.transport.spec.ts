import { request, RequestOptions } from 'node:https';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { requestGoogleRoutes } from './google-routes.transport';
jest.mock('node:https', () => ({ request: jest.fn() }));
const mocked = jest.mocked(request);
beforeEach(() => jest.resetAllMocks());
function respond(status: number, body: string) {
  const req = new EventEmitter() as ClientRequest;
  req.end = jest.fn(() => {
    const res = new PassThrough() as unknown as IncomingMessage;
    res.statusCode = status;
    const callback = mocked.mock.calls[0][1] as (r: IncomingMessage) => void;
    callback(res);
    res.end(body);
    return req;
  }) as never;
  mocked.mockReturnValue(req);
  return req;
}
it('uses allowlisted IPv4 with normal TLS, header-only key and limited response fields', async () => {
  const req = respond(200, '{"routes":[]}');
  await expect(
    requestGoogleRoutes('private', { travelMode: 'DRIVE' }),
  ).resolves.toEqual({ routes: [] });
  const options = mocked.mock.calls[0][0] as RequestOptions;
  expect(options).toMatchObject({
    hostname: 'routes.googleapis.com',
    path: '/directions/v2:computeRoutes',
    method: 'POST',
    family: 4,
    headers: { 'X-Goog-Api-Key': 'private' },
  });
  expect(options.rejectUnauthorized).not.toBe(false);
  expect(req.end).toHaveBeenCalledWith('{"travelMode":"DRIVE"}');
});
it('rejects provider HTTP errors without returning their body', async () => {
  respond(403, 'private provider detail');
  await expect(requestGoogleRoutes('private', {})).rejects.toThrow(
    'Provider rejected request',
  );
});
