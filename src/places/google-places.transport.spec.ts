import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { request } from 'node:https';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { requestGooglePlaces } from './google-places.transport';

jest.mock('node:https', () => ({ request: jest.fn() }));
const mocked = jest.mocked(request);
beforeEach(() => jest.resetAllMocks());
function respond(status: number, body: string) {
  const req = new EventEmitter() as ClientRequest;
  req.end = jest.fn(() => {
    const res = new PassThrough() as unknown as IncomingMessage;
    res.statusCode = status;
    const callback = mocked.mock.calls[0][2] as (r: IncomingMessage) => void;
    callback(res);
    res.end(body);
    return req;
  }) as never;
  mocked.mockReturnValue(req);
  return req;
}

it('uses server IPv4, a timeout and normal TLS for Places requests', async () => {
  const req = respond(200, '{"suggestions":[]}');
  const url = new URL('https://places.googleapis.com/v1/places:autocomplete');
  await expect(
    requestGooglePlaces(
      url,
      { 'X-Goog-Api-Key': 'secret' },
      { input: 'Basel' },
    ),
  ).resolves.toEqual({ suggestions: [] });
  expect(mocked.mock.calls[0][0]).toBe(url);
  const options = mocked.mock.calls[0][1];
  expect(options).toMatchObject({
    method: 'POST',
    family: 4,
    headers: { 'X-Goog-Api-Key': 'secret' },
  });
  expect(options.rejectUnauthorized).not.toBe(false);
  expect(options.signal).toBeInstanceOf(AbortSignal);
  expect(req.end).toHaveBeenCalledWith('{"input":"Basel"}');
});
it('uses GET for place details', async () => {
  const req = respond(200, '{}');
  await requestGooglePlaces(
    new URL('https://places.googleapis.com/v1/places/id'),
    {},
  );
  expect(mocked.mock.calls[0][1]).toMatchObject({ method: 'GET' });
  expect(req.end).toHaveBeenCalledWith(undefined);
});
it('hides provider HTTP error bodies', async () => {
  respond(403, 'provider secret');
  await expect(
    requestGooglePlaces(
      new URL('https://places.googleapis.com/v1/places/id'),
      {},
    ),
  ).rejects.toThrow('Place provider rejected request');
});
it.each([
  ['not JSON', 'Invalid place provider response'],
  ['x'.repeat(1024 * 1024 + 1), 'Place provider response too large'],
])('rejects malformed or oversized provider data', async (body, message) => {
  respond(200, body);
  await expect(
    requestGooglePlaces(
      new URL('https://places.googleapis.com/v1/places/id'),
      {},
    ),
  ).rejects.toThrow(message);
});
