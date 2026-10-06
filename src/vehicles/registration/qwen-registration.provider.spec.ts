import { ConfigService } from '@nestjs/config';
import { QwenRegistrationProvider } from './qwen-registration.provider';
import { syntheticExtraction } from './registration.fixtures';

describe('Qwen registration adapter', () => {
  const configuration = {
    QWEN_API_KEY: 'synthetic-test-key',
    QWEN_BASE_URL:
      'https://workspace.eu-central-1.maas.aliyuncs.com/compatible-mode/v1',
  };
  const make = (extra = {}) =>
    new QwenRegistrationProvider(
      new ConfigService({ ...configuration, ...extra }),
    );
  const reply = (
    content = JSON.stringify(syntheticExtraction()),
    finish = 'stop',
  ) =>
    new Response(
      JSON.stringify({
        choices: [{ finish_reason: finish, message: { content } }],
      }),
    );
  let fetchMock: jest.SpyInstance;
  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(reply());
  });
  afterEach(() => jest.restoreAllMocks());
  it('uses the configured region, base64 images, non-thinking JSON mode and default model', async () => {
    await make().extract([Buffer.from('synthetic')]);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${configuration.QWEN_BASE_URL}/chat/completions`);
    const body = JSON.parse(request.body as string) as {
      model: string;
      enable_thinking: boolean;
      response_format: unknown;
      messages: { content: { image_url?: { url: string } }[] }[];
    };
    expect(body).toMatchObject({
      model: 'qwen3-vl-plus',
      enable_thinking: false,
      response_format: { type: 'json_object' },
    });
    expect(body.messages[0].content[1].image_url?.url).toBe(
      'data:image/jpeg;base64,c3ludGhldGlj',
    );
  });
  it.each([
    {},
    { QWEN_API_KEY: '' },
    { QWEN_BASE_URL: '' },
    { QWEN_BASE_URL: 'http://example.com' },
    { QWEN_BASE_URL: 'https://user:password@example.com' },
  ])('configuration validation is lazy and safe: %s', (extra) => {
    const provider = new QwenRegistrationProvider(new ConfigService(extra));
    expect(() => provider.assertConfigured()).toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([400, 401, 403, 404, 422])(
    'does not retry configuration/input HTTP %s',
    (status) => {
      fetchMock.mockResolvedValue(new Response('', { status }));
      return expect(make().extract([Buffer.alloc(1)]))
        .rejects.toMatchObject({
          response: { code: 'REGISTRATION_CONFIGURATION' },
        })
        .then(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    },
  );
  it('retries a transient failure once', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(reply());
    await make().extract([Buffer.alloc(1)]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('bounds retries for rate limits and network failures', async () => {
    fetchMock.mockImplementation(async () => new Response('', { status: 429 }));
    await expect(make().extract([Buffer.alloc(1)])).rejects.toMatchObject({
      response: { code: 'REGISTRATION_RATE_LIMIT' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockClear().mockRejectedValue(new TypeError('network'));
    await expect(make().extract([Buffer.alloc(1)])).rejects.toMatchObject({
      response: { code: 'REGISTRATION_UNAVAILABLE' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('returns a bounded timeout error', async () => {
    jest.spyOn(AbortSignal, 'timeout').mockReturnValue(AbortSignal.abort());
    fetchMock.mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    await expect(make().extract([Buffer.alloc(1)])).rejects.toMatchObject({
      response: { code: 'REGISTRATION_TIMEOUT' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each(['', '{broken', '{}', '[]'])(
    'rejects malformed, empty or incomplete content without retry: %s',
    (content) => {
      fetchMock.mockResolvedValue(reply(content));
      return expect(make().extract([Buffer.alloc(1)]))
        .rejects.toMatchObject({
          response: { code: 'REGISTRATION_INVALID_OUTPUT' },
        })
        .then(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    },
  );
  it('rejects truncation and oversized responses without retry', async () => {
    fetchMock.mockResolvedValueOnce(
      reply(JSON.stringify(syntheticExtraction()), 'length'),
    );
    await expect(make().extract([Buffer.alloc(1)])).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock
      .mockClear()
      .mockResolvedValue(new Response('x'.repeat(128 * 1024 + 1)));
    await expect(make().extract([Buffer.alloc(1)])).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('aborts without retry after a client disconnect', async () => {
    const abort = new AbortController();
    abort.abort();
    fetchMock.mockRejectedValue(new DOMException('aborted', 'AbortError'));
    await expect(
      make().extract([Buffer.alloc(1)], abort.signal),
    ).rejects.toMatchObject({ response: { code: 'REGISTRATION_CANCELLED' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
