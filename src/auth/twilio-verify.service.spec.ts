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
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateVerification.mockResolvedValue({ status: 'pending' });
  });

  it('uses Twilio Verify SMS without a fixed sender', async () => {
    const config = {
      getOrThrow: jest.fn((key: string) =>
        ({
          TWILIO_ACCOUNT_SID: 'AC_test',
          TWILIO_AUTH_TOKEN: 'secret',
          TWILIO_VERIFY_SERVICE_SID: 'VA_test',
        })[key],
      ),
    } as unknown as ConfigService;
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
    const config = {
      getOrThrow: jest.fn((key: string) =>
        ({
          TWILIO_ACCOUNT_SID: 'AC_test',
          TWILIO_AUTH_TOKEN: 'secret',
          TWILIO_VERIFY_SERVICE_SID: 'VA_test',
        })[key],
      ),
    } as unknown as ConfigService;
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
});
