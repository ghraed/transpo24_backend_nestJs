import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { AuthenticatedUserGuard } from '../auth/guards/authenticated-user.guard';
import { TranslateBatchDto } from './dto/translate-batch.dto';
import { TranslateTextDto } from './dto/translate-text.dto';
import { TranslationRateLimitGuard } from './translation-rate-limit.guard';
import { TranslationService } from './translations.service';
import type {
  BatchTranslationResponseDto,
  TranslationResponseDto,
} from './translations.types';

@Controller('translations')
@UseGuards(AuthenticatedUserGuard, TranslationRateLimitGuard)
export class TranslationController {
  constructor(private readonly translationsService: TranslationService) {}

  @Post()
  async translate(
    @Body() dto: TranslateTextDto,
  ): Promise<TranslationResponseDto> {
    return this.translationsService.translate(dto);
  }

  @Post('batch')
  async translateBatch(
    @Body() dto: TranslateBatchDto,
  ): Promise<BatchTranslationResponseDto> {
    return this.translationsService.translateBatch(dto);
  }
}
