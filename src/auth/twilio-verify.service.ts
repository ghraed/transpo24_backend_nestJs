import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
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
  private readonly playReviewPhoneNumber: string | null;
  private readonly playReviewOtpCode: string | null;

  constructor(config: ConfigService) {
    const accountSid = config.getOrThrow<string>('TWILIO_ACCOUNT_SID');
    const authToken = config.getOrThrow<string>('TWILIO_AUTH_TOKEN');
    this.verifyServiceSid = config.getOrThrow<string>(
      'TWILIO_VERIFY_SERVICE_SID',
    );
    this.playReviewPhoneNumber =
      config.get<string>('PLAY_REVIEW_PHONE_NUMBER')?.trim() || null;
    this.playReviewOtpCode =
      config.get<string>('PLAY_REVIEW_OTP_CODE')?.trim() || null;
    this.client = twilio(accountSid, authToken);
  }

  async sendCode(phoneNumber: string): Promise<void> {
    if (this.isPlayReviewPhoneNumber(phoneNumber)) {
      this.logger.log(
        JSON.stringify({
          event: 'play_review_verification_requested',
          phone: maskPhoneNumber(phoneNumber),
        }),
      );
      return;
    }

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

      this.logger.log(
        JSON.stringify({
          event: 'twilio_verify_send_accepted',
          phone: maskPhoneNumber(phoneNumber),
          verificationSid: verification.sid,
          status: verification.status,
        }),
      );
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      this.logTwilioFailure('send', phoneNumber, error);
      throw new ServiceUnavailableException(this.sendFailureMessage(error));
    }
  }

  async verifyCode(
    phoneNumber: string,
    code: string,
  ): Promise<VerificationResult> {
    if (this.isPlayReviewPhoneNumber(phoneNumber)) {
      return this.isPlayReviewCode(code) ? 'approved' : 'invalid';
    }

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

  private isPlayReviewPhoneNumber(phoneNumber: string): boolean {
    return Boolean(
      this.playReviewPhoneNumber &&
      this.playReviewOtpCode &&
      phoneNumber === this.playReviewPhoneNumber,
    );
  }

  private isPlayReviewCode(code: string): boolean {
    if (
      !this.playReviewOtpCode ||
      code.length !== this.playReviewOtpCode.length
    ) {
      return false;
    }

    return timingSafeEqual(
      Buffer.from(code),
      Buffer.from(this.playReviewOtpCode),
    );
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

  private sendFailureMessage(error: unknown): string {
    const message = this.readMessage(error);
    const providerCode = this.readCode(error);

    if (!message) {
      return SEND_CODE_FAILURE_MESSAGE;
    }

    return providerCode
      ? `Twilio error ${providerCode}: ${message}`
      : `Twilio error: ${message}`;
  }

  private readMessage(error: unknown): string | undefined {
    if (!error || typeof error !== 'object' || !('message' in error)) {
      return undefined;
    }

    const message = error.message;
    return typeof message === 'string' && message.trim()
      ? message.trim()
      : undefined;
  }
}
