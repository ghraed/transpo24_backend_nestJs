import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  QwenRegistrationProvider,
  parseRegistrationContent,
} from './qwen-registration.provider';
import { printedField, syntheticExtraction } from './registration.fixtures';
import { REGISTRATION_OCR_PROMPT } from './registration-ocr';

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
  const readableExtraction = () => {
    const result = syntheticExtraction();
    result.fields.brand = printedField('Example Make');
    return result;
  };
  const reply = (
    content = JSON.stringify(readableExtraction()),
    finish = 'stop',
  ) =>
    new Response(
      JSON.stringify({
        choices: [{ finish_reason: finish, message: { content } }],
      }),
    );
  let fetchMock: jest.SpyInstance;
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(reply());
  });
  afterEach(() => jest.restoreAllMocks());
  it('uses the configured region, base64 images, structured OCR and default model', async () => {
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
      temperature: 0,
      response_format: { type: 'json_object' },
    });
    expect(body.messages[0].content[0].image_url?.url).toBe(
      'data:image/jpeg;base64,c3ludGhldGlj',
    );
    expect(body.messages[0].content[0]).not.toHaveProperty('max_pixels');
  });
  it('keeps OCR-specific parameters only for an explicitly configured OCR model', async () => {
    await make({ QWEN_MODEL: 'qwen-vl-ocr' }).extract([Buffer.alloc(1)]);
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    ) as {
      model: string;
      response_format?: unknown;
      messages: { content: { max_pixels?: number }[] }[];
    };
    expect(body.model).toBe('qwen-vl-ocr');
    expect(body.response_format).toBeUndefined();
    expect(body.messages[0].content[0].max_pixels).toBe(23520000);
  });
  it('accepts OCR JSON wrapped in a Markdown fence', async () => {
    fetchMock.mockResolvedValue(
      reply('```json\n' + JSON.stringify(readableExtraction()) + '\n```'),
    );
    await expect(make().extract([Buffer.alloc(1)])).resolves.toMatchObject({
      status: 'partial',
    });
  });
  it('extracts the reported vehicle and normalizes its printed date through the provider', async () => {
    fetchMock.mockResolvedValueOnce(
      reply(
        JSON.stringify({
          status: 'partial',
          fields: {
            brand: 'Ford',
            model: 'Transit Courier',
            vin: 'WF0WXXTACWKJ75955',
            emptyWeightKg: printedField(
              '1349',
              'Leergewicht',
              'kg',
              'empty_weight',
            ),
            manufactureYear: printedField(
              '30.12.2019',
              '1. Inverkehrsetzung',
              null,
              'first_registration_date',
            ),
          },
        }),
      ),
    );
    const result = await make().extract([Buffer.alloc(1)]);
    expect(result.fields).toMatchObject({
      brand: { value: 'Ford' },
      model: { value: 'Transit Courier' },
      vin: { value: 'WF0WXXTACWKJ75955' },
      emptyWeightKg: { value: 1349 },
      manufactureYear: { value: 2019 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    ) as { messages: { content: { text?: string }[] }[] };
    expect(body.messages[0].content.at(-1)?.text).toBe(REGISTRATION_OCR_PROMPT);
    expect(REGISTRATION_OCR_PROMPT).toContain('ANY language');
    expect(REGISTRATION_OCR_PROMPT).not.toContain('WF0WXXTACWKJ75955');
    expect(REGISTRATION_OCR_PROMPT).not.toContain('1349');
  });
  it.each(['bare number', 'volume evidence'])(
    're-reads a rejected displacement value from %s and fills the printed empty weight',
    async (source) => {
      fetchMock
        .mockResolvedValueOnce(
          reply(
            JSON.stringify({
              fields: {
                vin: 'VF3 0U5 FVA ES09 9966',
                swissRegistrationNumber: '649.403.107',
                brand: 'Peugeot',
                model: '3008 1.6i Turbo',
                manufactureYear: printedField(
                  '13.06.2014',
                  '1re mise en circulation',
                  null,
                  'first_registration_date',
                ),
                emptyWeightKg:
                  source === 'bare number'
                    ? 1598
                    : printedField(
                        '1598',
                        'Cylindrée',
                        'cm³',
                        'engine_displacement',
                      ),
              },
            }),
          ),
        )
        .mockResolvedValueOnce(
          reply(
            JSON.stringify({
              fields: {
                emptyWeightKg: printedField(
                  '**1607',
                  'Leergewicht / Poids à vide',
                  'kg',
                  'empty_weight',
                ),
              },
            }),
          ),
        );
      const result = await make().extract([Buffer.alloc(1)]);
      expect(result.fields.vin.value).toBe('VF30U5FVAES099966');
      expect(result.fields.swissRegistrationNumber.value).toBe('649403107');
      expect(result.fields.emptyWeightKg).toMatchObject({
        value: 1607,
        status: 'extracted',
      });
      expect(result.fields.emptyWeightKg.evidence[0].meaning).toBe(
        'empty_weight',
      );
      expect(result.fields.manufactureYear.value).toBe(2014);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );
  it('keeps a weight empty when both model responses substitute engine capacity', async () => {
    fetchMock.mockImplementation(async () =>
      reply(
        JSON.stringify({
          fields: {
            vin: 'VF30U5FVAES099966',
            brand: 'Peugeot',
            model: '3008 1.6i Turbo',
            emptyWeightKg: printedField(
              '1598',
              'Cylindrée',
              'cm³',
              'engine_displacement',
            ),
          },
        }),
      ),
    );
    const result = await make().extract([Buffer.alloc(1)]);
    expect(result.fields.emptyWeightKg.value).toBeNull();
    expect(result.fields.model.value).toBe('3008 1.6i Turbo');
    expect(result.status).toBe('partial');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('retries a valid response that discarded every field, with a multilingual format correction', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(JSON.stringify(syntheticExtraction())))
      .mockResolvedValueOnce(
        reply(
          JSON.stringify({
            fields: { brand: 'Ford', model: 'Transit Courier' },
          }),
        ),
      );
    const result = await make().extract([Buffer.alloc(1)]);
    expect(result.fields.model.value).toBe('Transit Courier');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1][1] as RequestInit).body).toContain(
      'any language',
    );
  });
  it.each(['wrong_document', 'unreadable'])(
    'does not retry a definitive %s result',
    async (status) => {
      fetchMock.mockResolvedValueOnce(
        reply(JSON.stringify({ ...syntheticExtraction(), status })),
      );
      await expect(make().extract([Buffer.alloc(1)])).resolves.toMatchObject({
        status,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it('returns an empty partial result after one retry so the user can choose another photo', async () => {
    fetchMock.mockImplementation(async () =>
      reply(JSON.stringify(syntheticExtraction())),
    );
    const result = await make().extract([Buffer.alloc(1)]);
    expect(result.fields.brand.value).toBeNull();
    expect(result.status).toBe('partial');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('recovers the reported row mix-up by re-reading printed rows, without losing weight or year', async () => {
    fetchMock
      .mockResolvedValueOnce(
        reply(
          JSON.stringify({
            fields: {
              vin: null,
              brand: 'fahrgetell-Nr',
              model: 'Fourgon',
              emptyWeightKg: printedField(
                '1349',
                'Leergewicht',
                'kg',
                'empty_weight',
              ),
              manufactureYear: printedField(
                '30.12.2019',
                '1. Inverkehrsetzung',
                null,
                'first_registration_date',
              ),
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        reply(`21. Marke und Typ/Marque et type: FORD TRANSIT COURIER
23. Fahrgestell-Nr./N° de châssis: WF0WXXTACWKJ75955
25. Karosserie/Carrosserie: Fourgon`),
      );
    const result = await make({ QWEN_MODEL: 'qwen-vl-ocr' }).extract([
      Buffer.alloc(1),
    ]);
    expect(result.fields).toMatchObject({
      vin: { value: 'WF0WXXTACWKJ75955', status: 'extracted' },
      brand: { value: 'FORD TRANSIT COURIER', status: 'extracted' },
      model: { value: 'FORD TRANSIT COURIER', status: 'extracted' },
      emptyWeightKg: { value: 1349 },
      manufactureYear: { value: 2019 },
    });
    expect(
      result.warnings.some((w) => w.field === 'brand' || w.field === 'model'),
    ).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retry = JSON.parse(
      (fetchMock.mock.calls[1][1] as RequestInit).body as string,
    ) as { messages: { content: { text?: string }[] }[] };
    expect(retry.messages[0].content.at(-1)?.text).toContain(
      'one row per line',
    );
    expect(retry.messages[0].content.at(-1)?.text).not.toContain(
      'WF0WXXTACWKJ75955',
    );
  });
  it('re-reads a missing VIN even when the other identity fields look valid', async () => {
    fetchMock
      .mockResolvedValueOnce(
        reply(
          JSON.stringify({
            fields: { brand: 'Ford', model: 'Transit Courier' },
          }),
        ),
      )
      .mockResolvedValueOnce(reply('Fahrgestell-Nr.: WF0WXXTACWKJ75955'));
    const result = await make().extract([Buffer.alloc(1)]);
    expect(result.fields.vin.value).toBe('WF0WXXTACWKJ75955');
    expect(result.fields.brand.value).toBe('Ford');
    expect(result.fields.model.value).toBe('Transit Courier');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each(['unreadable response', 'timeout', 'unavailable'])(
    'preserves validated fields when identity recovery fails: %s',
    async (failure) => {
      fetchMock.mockResolvedValueOnce(
        reply(
          JSON.stringify({
            fields: {
              brand: 'fahrgetell-Nr',
              model: 'Fourgon',
              emptyWeightKg: printedField(
                '1349',
                'Leergewicht',
                'kg',
                'empty_weight',
              ),
              manufactureYear: printedField(
                '30.12.2019',
                '1. Inverkehrsetzung',
                null,
                'first_registration_date',
              ),
            },
          }),
        ),
      );
      if (failure === 'unreadable response')
        fetchMock.mockResolvedValueOnce(reply('No readable rows'));
      else if (failure === 'timeout')
        fetchMock.mockRejectedValueOnce(
          new DOMException('timeout', 'TimeoutError'),
        );
      else fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));
      const result = await make().extract([Buffer.alloc(1)]);
      expect(result.fields.brand.value).toBeNull();
      expect(result.fields.model.value).toBeNull();
      expect(result.fields.emptyWeightKg.value).toBe(1349);
      expect(result.fields.manufactureYear.value).toBe(2019);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );
  it('honors cancellation during identity recovery', async () => {
    const abort = new AbortController();
    fetchMock
      .mockResolvedValueOnce(
        reply(
          JSON.stringify({
            fields: { brand: 'Ford', model: 'Transit Courier' },
          }),
        ),
      )
      .mockImplementationOnce(async () => {
        abort.abort();
        throw new DOMException('cancelled', 'AbortError');
      });
    await expect(
      make().extract([Buffer.alloc(1)], abort.signal),
    ).rejects.toMatchObject({ response: { code: 'REGISTRATION_CANCELLED' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
    'bounds retries for malformed, empty or incomplete content: %s',
    (content) => {
      fetchMock.mockResolvedValue(reply(content));
      return expect(make().extract([Buffer.alloc(1)]))
        .rejects.toMatchObject({
          response: { code: 'REGISTRATION_INVALID_OUTPUT' },
        })
        .then(() =>
          expect(fetchMock).toHaveBeenCalledTimes(content === '' ? 1 : 2),
        );
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
  it('automatically retries a wrong-shaped OCR response with a format correction', async () => {
    fetchMock
      .mockResolvedValueOnce(
        reply(
          JSON.stringify({
            status: 'partial',
            details: { brand: 'Ford', model: 'Transit Courier' },
          }),
        ),
      )
      .mockResolvedValueOnce(reply());
    await expect(make().extract([Buffer.alloc(1)])).resolves.toMatchObject({
      status: 'partial',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1][1] as RequestInit).body).toContain(
      'original printed vehicle labels',
    );
  });
  it('logs the failure stage without logging card contents', async () => {
    fetchMock.mockResolvedValue(reply('PRIVATE_CARD_TEXT'));
    await expect(make().extract([Buffer.alloc(1)])).rejects.toThrow();
    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      expect.stringContaining('stage=printed_labels'),
    );
    const logs = JSON.stringify([
      (Logger.prototype.log as jest.Mock).mock.calls,
      (Logger.prototype.warn as jest.Mock).mock.calls,
    ]);
    expect(logs).not.toContain('PRIVATE_CARD_TEXT');
    expect(logs).not.toContain(configuration.QWEN_API_KEY);
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

it('parses a complete JSON object surrounded by model prose and fences', () => {
  expect(
    parseRegistrationContent(
      'Here is the JSON:\n```json\n{"status":"partial","fields":{}}\n```',
    ),
  ).toEqual({ status: 'partial', fields: {} });
  expect(
    parseRegistrationContent(
      'Result: {"value":"a } brace and \\"quote\\""} Done',
    ),
  ).toEqual({ value: 'a } brace and "quote"' });
  expect(() => parseRegistrationContent('```json\n{"status":')).toThrow();
});

it('accepts compact OCR details through the provider without a second request', async () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                status: 'partial',
                fields: {
                  brand: 'Ford',
                  model: 'Transit Courier',
                  vin: 'WF0WXXTACWKJ75955',
                  emptyWeightKg: printedField(
                    '1550',
                    'Leergewicht',
                    'kg',
                    'empty_weight',
                  ),
                },
              }),
            },
          },
        ],
      }),
    ),
  );
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  try {
    const provider = new QwenRegistrationProvider(
      new ConfigService({
        QWEN_API_KEY: 'synthetic-test-key',
        QWEN_BASE_URL: 'https://api.test/v1',
      }),
    );
    const result = await provider.extract([Buffer.alloc(1)]);
    expect(result.fields.brand.value).toBe('Ford');
    expect(result.fields.model.value).toBe('Transit Courier');
    expect(result.fields.emptyWeightKg.value).toBe(1550);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  } finally {
    jest.restoreAllMocks();
  }
});
