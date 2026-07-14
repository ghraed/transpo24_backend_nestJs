import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { GoogleTranslateProvider } from './google-translate.provider';
import { TranslationCacheService } from './translation-cache.service';
import {
  MAX_TRANSLATION_BATCH_SIZE,
  MAX_TRANSLATION_TEXT_LENGTH,
  SUPPORTED_TRANSLATION_LANGUAGES,
} from './translations.constants';
import { TranslateBatchDto } from './dto/translate-batch.dto';
import { TranslateTextDto } from './dto/translate-text.dto';
import type {
  BatchTranslationResponseDto,
  SupportedTranslationLanguage,
  TranslationResponseDto,
} from './translations.types';

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);

  constructor(
    private readonly googleTranslateProvider: GoogleTranslateProvider,
    private readonly cacheService: TranslationCacheService,
  ) {}

  async translate(dto: TranslateTextDto): Promise<TranslationResponseDto> {
    const text = this.normalizeText(dto.text);
    const sourceLanguage = this.normalizeLanguage(dto.sourceLanguage);
    const targetLanguage = this.normalizeLanguage(dto.targetLanguage);

    if (sourceLanguage === targetLanguage) {
      return {
        originalText: text,
        translatedText: text,
        sourceLanguage,
        targetLanguage,
      };
    }

    const cacheKey = this.cacheService.buildTranslationCacheKey({
      sourceLanguage,
      targetLanguage,
      text,
    });
    const cached = await this.cacheService.get(cacheKey);

    if (cached !== null) {
      this.logTranslationEvent({
        mode: 'single',
        sourceLanguage,
        targetLanguage,
        textCount: 1,
        cacheHits: 1,
        providerCalls: 0,
      });
      return {
        originalText: text,
        translatedText: cached,
        sourceLanguage,
        targetLanguage,
      };
    }

    const [translated] = await this.googleTranslateProvider.translateTexts({
      texts: [text],
      sourceLanguage,
      targetLanguage,
    });

    await this.cacheService.set(
      cacheKey,
      translated.translatedText,
      this.cacheService.cacheTtlSeconds,
    );

    this.logTranslationEvent({
      mode: 'single',
      sourceLanguage,
      targetLanguage,
      textCount: 1,
      cacheHits: 0,
      providerCalls: 1,
    });

    return {
      originalText: text,
      translatedText: translated.translatedText,
      sourceLanguage,
      targetLanguage,
    };
  }

  async translateBatch(
    dto: TranslateBatchDto,
  ): Promise<BatchTranslationResponseDto> {
    const texts = this.normalizeTexts(dto.texts);
    const sourceLanguage = this.normalizeLanguage(dto.sourceLanguage);
    const targetLanguage = this.normalizeLanguage(dto.targetLanguage);

    if (sourceLanguage === targetLanguage) {
      return {
        translations: texts.map((text) => ({
          originalText: text,
          translatedText: text,
          sourceLanguage,
          targetLanguage,
        })),
      };
    }

    const translations = new Array<TranslationResponseDto>(texts.length);
    const missingByKey = new Map<string, { text: string; indexes: number[] }>();
    let cacheHits = 0;

    await Promise.all(
      texts.map(async (text, index) => {
        const cacheKey = this.cacheService.buildTranslationCacheKey({
          sourceLanguage,
          targetLanguage,
          text,
        });
        const cached = await this.cacheService.get(cacheKey);

        if (cached !== null) {
          cacheHits += 1;
          translations[index] = {
            originalText: text,
            translatedText: cached,
            sourceLanguage,
            targetLanguage,
          };
          return;
        }

        const existing = missingByKey.get(cacheKey);
        if (existing) {
          existing.indexes.push(index);
          return;
        }

        missingByKey.set(cacheKey, { text, indexes: [index] });
      }),
    );

    const missingEntries = Array.from(missingByKey.entries());
    if (missingEntries.length > 0) {
      const translated = await this.googleTranslateProvider.translateTexts({
        texts: missingEntries.map(([, entry]) => entry.text),
        sourceLanguage,
        targetLanguage,
      });

      await Promise.all(
        translated.map(async (item, translatedIndex) => {
          const [cacheKey, entry] = missingEntries[translatedIndex];
          await this.cacheService.set(
            cacheKey,
            item.translatedText,
            this.cacheService.cacheTtlSeconds,
          );

          for (const index of entry.indexes) {
            translations[index] = {
              originalText: entry.text,
              translatedText: item.translatedText,
              sourceLanguage,
              targetLanguage,
            };
          }
        }),
      );
    }

    this.logTranslationEvent({
      mode: 'batch',
      sourceLanguage,
      targetLanguage,
      textCount: texts.length,
      cacheHits,
      providerCalls: missingEntries.length,
    });

    return { translations };
  }

  private normalizeTexts(texts: string[]): string[] {
    if (!Array.isArray(texts) || texts.length === 0) {
      throw new BadRequestException('texts must contain at least one item.');
    }

    if (texts.length > MAX_TRANSLATION_BATCH_SIZE) {
      throw new BadRequestException(
        'texts must contain at most ' + MAX_TRANSLATION_BATCH_SIZE + ' items.',
      );
    }

    return texts.map((text) => this.normalizeText(text));
  }

  private normalizeText(value: string): string {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) {
      throw new BadRequestException('text must not be empty.');
    }

    if (text.length > MAX_TRANSLATION_TEXT_LENGTH) {
      throw new BadRequestException(
        'text must be at most ' +
          MAX_TRANSLATION_TEXT_LENGTH +
          ' characters long.',
      );
    }

    return text;
  }

  private normalizeLanguage(value: string): SupportedTranslationLanguage {
    const normalized =
      typeof value === 'string' ? value.trim().toLowerCase() : '';

    if (!this.isSupportedLanguage(normalized)) {
      throw new BadRequestException('Unsupported language.');
    }

    return normalized;
  }

  private isSupportedLanguage(
    value: string,
  ): value is SupportedTranslationLanguage {
    return (SUPPORTED_TRANSLATION_LANGUAGES as readonly string[]).includes(
      value,
    );
  }

  private logTranslationEvent(input: {
    mode: 'single' | 'batch';
    sourceLanguage: SupportedTranslationLanguage;
    targetLanguage: SupportedTranslationLanguage;
    textCount: number;
    cacheHits: number;
    providerCalls: number;
  }): void {
    this.logger.log(
      JSON.stringify({
        event: 'translation_completed',
        mode: input.mode,
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
        textCount: input.textCount,
        cacheHits: input.cacheHits,
        providerCalls: input.providerCalls,
      }),
    );
  }
}
