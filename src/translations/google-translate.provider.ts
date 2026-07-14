import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as TranslateV2 } from '@google-cloud/translate';
import { existsSync, readFileSync } from 'node:fs';

import type {
  SupportedTranslationLanguage,
  TranslationProviderResult,
} from './translations.types';

type GoogleTranslateError = Error & {
  code?: number;
  details?: string;
  errors?: Array<{ reason?: string; message?: string }>;
};

type ServiceAccountCredentials = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

@Injectable()
export class GoogleTranslateProvider {
  private readonly logger = new Logger(GoogleTranslateProvider.name);
  private readonly client: InstanceType<typeof TranslateV2.Translate> | null;

  constructor(private readonly configService: ConfigService) {
    this.client = this.createClient();
  }

  async translateTexts(input: {
    texts: string[];
    sourceLanguage: SupportedTranslationLanguage;
    targetLanguage: SupportedTranslationLanguage;
  }): Promise<TranslationProviderResult[]> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Translation service is not configured.',
      );
    }

    try {
      const [translated] = await this.client.translate(input.texts, {
        from: input.sourceLanguage,
        to: input.targetLanguage,
        format: 'text',
      });

      const normalized = Array.isArray(translated) ? translated : [translated];
      if (normalized.length !== input.texts.length) {
        throw new BadGatewayException(
          'Translation provider returned an unexpected response.',
        );
      }

      return normalized.map((translatedText) => ({
        translatedText:
          typeof translatedText === 'string'
            ? translatedText
            : String(translatedText ?? ''),
      }));
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw this.toHttpException(error);
    }
  }

  private createClient(): InstanceType<typeof TranslateV2.Translate> | null {
    const inlineCredentials = this.readInlineCredentials();
    const credentialsFilePath = this.configService
      .get<string>('GOOGLE_APPLICATION_CREDENTIALS')
      ?.trim();

    if (!inlineCredentials && !credentialsFilePath) {
      this.logger.warn(
        JSON.stringify({
          event: 'translation_config_missing',
          provider: 'google_translate_v2',
        }),
      );
      return null;
    }

    try {
      if (inlineCredentials) {
        return new TranslateV2.Translate(inlineCredentials);
      }

      this.validateCredentialsFile(credentialsFilePath ?? '');
      return new TranslateV2.Translate();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        JSON.stringify({
          event: 'translation_client_init_failed',
          provider: 'google_translate_v2',
          message,
        }),
      );
      throw new Error(message);
    }
  }

  private validateCredentialsFile(filePath: string): void {
    if (!filePath) {
      throw new Error(
        'Google Translate startup check failed: GOOGLE_APPLICATION_CREDENTIALS is empty.',
      );
    }

    if (!existsSync(filePath)) {
      throw new Error(
        `Google Translate startup check failed: credentials file not found at "${filePath}". Update GOOGLE_APPLICATION_CREDENTIALS or place the service-account JSON at that path.`,
      );
    }

    let rawJson = '';
    try {
      rawJson = readFileSync(filePath, 'utf8');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown read error';
      throw new Error(
        `Google Translate startup check failed: could not read credentials file "${filePath}". ${message}`,
      );
    }

    let parsed: ServiceAccountCredentials;
    try {
      parsed = JSON.parse(rawJson) as ServiceAccountCredentials;
    } catch {
      throw new Error(
        `Google Translate startup check failed: credentials file "${filePath}" does not contain valid JSON.`,
      );
    }

    const clientEmail = parsed.client_email?.trim();
    const privateKey = this.normalizePrivateKey(parsed.private_key);

    if (!clientEmail || !privateKey) {
      throw new Error(
        `Google Translate startup check failed: credentials file "${filePath}" must include service-account client_email and private_key fields.`,
      );
    }
  }

  private readInlineCredentials(): {
    projectId?: string;
    credentials: {
      client_email: string;
      private_key: string;
    };
  } | null {
    const rawJson =
      this.configService
        .get<string>('GOOGLE_TRANSLATE_CREDENTIALS_JSON')
        ?.trim() ||
      this.configService
        .get<string>('GOOGLE_APPLICATION_CREDENTIALS_JSON')
        ?.trim();

    if (rawJson) {
      let parsed: ServiceAccountCredentials;
      try {
        parsed = JSON.parse(rawJson) as ServiceAccountCredentials;
      } catch {
        throw new Error(
          'Google Translate startup check failed: GOOGLE_TRANSLATE_CREDENTIALS_JSON must be valid JSON.',
        );
      }

      const clientEmail = parsed.client_email?.trim();
      const privateKey = this.normalizePrivateKey(parsed.private_key);
      const projectId = parsed.project_id?.trim();

      if (!clientEmail || !privateKey) {
        throw new Error(
          'Google Translate startup check failed: GOOGLE_TRANSLATE_CREDENTIALS_JSON must include client_email and private_key.',
        );
      }

      return {
        ...(projectId ? { projectId } : {}),
        credentials: {
          client_email: clientEmail,
          private_key: privateKey,
        },
      };
    }

    const clientEmail =
      this.configService.get<string>('GOOGLE_TRANSLATE_CLIENT_EMAIL')?.trim() ||
      this.configService.get<string>('GOOGLE_CLIENT_EMAIL')?.trim();
    const privateKey = this.normalizePrivateKey(
      this.configService.get<string>('GOOGLE_TRANSLATE_PRIVATE_KEY') ||
        this.configService.get<string>('GOOGLE_PRIVATE_KEY'),
    );
    const projectId =
      this.configService.get<string>('GOOGLE_TRANSLATE_PROJECT_ID')?.trim() ||
      this.configService.get<string>('GOOGLE_PROJECT_ID')?.trim() ||
      this.configService.get<string>('GOOGLE_CLOUD_PROJECT')?.trim();

    if (!clientEmail && !privateKey) {
      return null;
    }

    if (!clientEmail || !privateKey) {
      throw new Error(
        'Google Translate startup check failed: GOOGLE_TRANSLATE_CLIENT_EMAIL and GOOGLE_TRANSLATE_PRIVATE_KEY must be configured together.',
      );
    }

    return {
      ...(projectId ? { projectId } : {}),
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
    };
  }

  private normalizePrivateKey(value?: string | null): string | null {
    const normalized = value?.trim();
    if (!normalized) {
      return null;
    }

    return normalized.replace(/\\n/g, '\n');
  }

  private toHttpException(error: unknown): HttpException {
    const googleError = error as GoogleTranslateError;
    const code =
      typeof googleError?.code === 'number' ? googleError.code : undefined;
    const message = this.toSafeErrorMessage(googleError);

    this.logger.warn(
      JSON.stringify({
        event: 'translation_provider_error',
        provider: 'google_translate_v2',
        code: code ?? null,
        message,
      }),
    );

    if (code === 429 || code === 8) {
      return new HttpException(
        'Translation provider rate limit exceeded.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (code === 400) {
      return new BadGatewayException('Translation request was rejected.');
    }

    if (code === 403 || code === 7) {
      return new ServiceUnavailableException(
        'Translation provider is unavailable.',
      );
    }

    return new BadGatewayException(
      message || 'Translation provider request failed.',
    );
  }

  private toSafeErrorMessage(error: GoogleTranslateError): string {
    if (typeof error?.details === 'string' && error.details.trim()) {
      return error.details;
    }

    const nestedMessage = error?.errors?.find((item) => item?.message)?.message;
    if (nestedMessage) {
      return nestedMessage;
    }

    if (typeof error?.message === 'string' && error.message.trim()) {
      return error.message;
    }

    return 'Unknown translation provider error.';
  }
}
