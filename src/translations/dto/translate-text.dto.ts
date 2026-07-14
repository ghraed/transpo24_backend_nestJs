import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

import {
  MAX_TRANSLATION_TEXT_LENGTH,
  SUPPORTED_TRANSLATION_LANGUAGES,
} from '../translations.constants';
import type { SupportedTranslationLanguage } from '../translations.types';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const normalizeLanguage = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class TranslateTextDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_TRANSLATION_TEXT_LENGTH)
  text!: string;

  @Transform(normalizeLanguage)
  @IsString()
  @IsIn(SUPPORTED_TRANSLATION_LANGUAGES)
  targetLanguage!: SupportedTranslationLanguage;

  @Transform(normalizeLanguage)
  @IsString()
  @IsIn(SUPPORTED_TRANSLATION_LANGUAGES)
  sourceLanguage!: SupportedTranslationLanguage;
}
