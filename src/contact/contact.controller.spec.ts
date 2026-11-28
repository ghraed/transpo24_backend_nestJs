import type { Request } from 'express';

import { ContactController } from './contact.controller';

describe('ContactController', () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.CONTACT_EMAIL_FROM;
  const request = { ip: '192.0.2.10' } as Request;
  const message = {
    name: 'Sam Customer',
    email: 'sam@example.com',
    message: 'Please contact me about a delivery.',
    website: '',
  };

  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.CONTACT_EMAIL_FROM = 'Transpo24 <contact@transpo24.com>';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
    if (originalFrom === undefined) delete process.env.CONTACT_EMAIL_FROM;
    else process.env.CONTACT_EMAIL_FROM = originalFrom;
  });

  it('sends to the fixed company inbox with the visitor as reply-to', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock;

    await expect(
      new ContactController().submit(message, request),
    ).resolves.toEqual({ ok: true });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(options.body as string) as Record<
      string,
      unknown
    >;
    expect(payload.to).toEqual(['info@transpo24.com']);
    expect(payload.reply_to).toBe(message.email);
    expect(payload.text).toContain(message.message);
  });

  it('does not claim success when the provider rejects a message', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(
      new ContactController().submit(message, request),
    ).rejects.toMatchObject({ status: 503 });
  });
});
