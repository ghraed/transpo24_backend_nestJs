import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

import {
  MAX_TRANSLATION_BATCH_SIZE,
  MAX_TRANSLATION_TEXT_LENGTH,
  SUPPORTED_TRANSLATION_LANGUAGES,
} from '../translations.constants';
import type { SupportedTranslationLanguage } from '../translations.types';

const trimStringArray = ({ value }: { value: unknown }): unknown => {
  if (!Array.isArray(value)) {
    return value;
  }

  return (value as unknown[]).map((item) =>
    typeof item === 'string' ? item.trim() : item,
  );
};

const normalizeLanguage = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class TranslateBatchDto {
  @Transform(trimStringArray)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_TRANSLATION_BATCH_SIZE)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(MAX_TRANSLATION_TEXT_LENGTH, { each: true })
  texts!: string[];

  @Transform(normalizeLanguage)
  @IsString()
  @IsIn(SUPPORTED_TRANSLATION_LANGUAGES)
  targetLanguage!: SupportedTranslationLanguage;

  @Transform(normalizeLanguage)
  @IsString()
  @IsIn(SUPPORTED_TRANSLATION_LANGUAGES)
  sourceLanguage!: SupportedTranslationLanguage;
}
