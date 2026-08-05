import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio, { type Twilio } from 'twilio';

import { maskPhoneNumber } from './phone-number.util';

export type VerificationResult = 'approved' | 'invalid' | 'expired';

const SEND_CODE_FAILURE_MESSAGE =
  'Unable to send an SMS verification code. Check that Twilio Verify SMS is enabled for this project and that the destination number can receive SMS, then try again.';

@Injectable()
export class TwilioVerifyService {
  private readonly logger = new Logger(TwilioVerifyService.name);
  private readonly client: Twilio;
  private readonly verifyServiceSid: string;

  constructor(config: ConfigService) {
    const accountSid = config.getOrThrow<string>('TWILIO_ACCOUNT_SID');
    const authToken = config.getOrThrow<string>('TWILIO_AUTH_TOKEN');
    this.verifyServiceSid = config.getOrThrow<string>(
      'TWILIO_VERIFY_SERVICE_SID',
    );
    this.client = twilio(accountSid, authToken);
  }

  async sendCode(phoneNumber: string): Promise<void> {
    try {
      const verification = await this.client.verify.v2
        .services(this.verifyServiceSid)
        .verifications.create({
          to: phoneNumber,
          channel: 'sms',
        });

      if (!['pending', 'approved'].includes(verification.status)) {
        throw new BadGatewayException(SEND_CODE_FAILURE_MESSAGE);
      }
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      this.logTwilioFailure('send', phoneNumber, error);
      throw new ServiceUnavailableException(SEND_CODE_FAILURE_MESSAGE);
    }
  }

  async verifyCode(
    phoneNumber: string,
    code: string,
  ): Promise<VerificationResult> {
    try {
      const check = await this.client.verify.v2
        .services(this.verifyServiceSid)
        .verificationChecks.create({ to: phoneNumber, code });

      if (check.status === 'approved') {
        return 'approved';
      }

      return check.status === 'pending' ? 'invalid' : 'expired';
    } catch (error) {
      const status = this.readStatus(error);
      const codeValue = this.readCode(error);
      if (status === 404 || codeValue === 20404) {
        return 'expired';
      }

      this.logTwilioFailure('verify', phoneNumber, error);
      throw new ServiceUnavailableException(
        'Unable to verify the code right now.',
      );
    }
  }

  private logTwilioFailure(
    operation: 'send' | 'verify',
    phoneNumber: string,
    error: unknown,
  ): void {
    this.logger.error(
      JSON.stringify({
        event: `twilio_verify_${operation}_failed`,
        phone: maskPhoneNumber(phoneNumber),
        status: this.readStatus(error),
        providerCode: this.readCode(error),
      }),
    );
  }

  private readStatus(error: unknown): number | undefined {
    if (!error || typeof error !== 'object' || !('status' in error)) {
      return undefined;
    }
    return typeof error.status === 'number' ? error.status : undefined;
  }

  private readCode(error: unknown): number | undefined {
    if (!error || typeof error !== 'object' || !('code' in error)) {
      return undefined;
    }
    return typeof error.code === 'number' ? error.code : undefined;
  }
}
