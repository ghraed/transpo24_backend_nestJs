import { SUPPORTED_TRANSLATION_LANGUAGES } from './translations.constants';

export type SupportedTranslationLanguage =
  (typeof SUPPORTED_TRANSLATION_LANGUAGES)[number];

export type TranslationResponseDto = {
  originalText: string;
  translatedText: string;
  sourceLanguage: SupportedTranslationLanguage;
  targetLanguage: SupportedTranslationLanguage;
};

export type BatchTranslationResponseDto = {
  translations: TranslationResponseDto[];
};

export type TranslationProviderResult = {
  translatedText: string;
  detectedSourceLanguage?: string | null;
};
