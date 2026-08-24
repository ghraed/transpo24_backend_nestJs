import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';

import { TwilioVerifyService } from './twilio-verify.service';

const mockCreateVerification = jest.fn();
const mockSelectService = jest.fn().mockReturnValue({
  verifications: { create: mockCreateVerification },
});

jest.mock('twilio', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    verify: { v2: { services: mockSelectService } },
  })),
}));

describe('TwilioVerifyService', () => {
  function createConfig(overrides: Record<string, string> = {}): ConfigService {
    const values: Record<string, string> = {
      TWILIO_ACCOUNT_SID: 'AC_test',
      TWILIO_AUTH_TOKEN: 'secret',
      TWILIO_VERIFY_SERVICE_SID: 'VA_test',
      ...overrides,
    };

    return {
      getOrThrow: jest.fn((key: string) => values[key]),
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateVerification.mockResolvedValue({ status: 'pending' });
  });

  it('uses Twilio Verify SMS without a fixed sender', async () => {
    const config = createConfig();
    const service = new TwilioVerifyService(config);

    await service.sendCode('+96170123456');

    expect(twilio).toHaveBeenCalledWith('AC_test', 'secret');
    expect(mockSelectService).toHaveBeenCalledWith('VA_test');
    expect(mockCreateVerification).toHaveBeenCalledWith({
      to: '+96170123456',
      channel: 'sms',
    });
  });

  it("returns Twilio's delivery error and provider code to the client", async () => {
    const config = createConfig();
    const service = new TwilioVerifyService(config);
    mockCreateVerification.mockRejectedValue({
      code: 60610,
      status: 400,
      message: 'Phone number is outside of coverage.',
    });

    await expect(service.sendCode('+96171251044')).rejects.toMatchObject({
      response: {
        message: 'Twilio error 60610: Phone number is outside of coverage.',
      },
    });
  });

  it('uses reusable backend-only credentials for the Google Play reviewer', async () => {
    const service = new TwilioVerifyService(
      createConfig({
        PLAY_REVIEW_PHONE_NUMBER: '+41791234567',
        PLAY_REVIEW_OTP_CODE: '583104',
      }),
    );

    await service.sendCode('+41791234567');

    expect(mockCreateVerification).not.toHaveBeenCalled();
    await expect(service.verifyCode('+41791234567', '583104')).resolves.toBe(
      'approved',
    );
    await expect(service.verifyCode('+41791234567', '000000')).resolves.toBe(
      'invalid',
    );
  });
});
