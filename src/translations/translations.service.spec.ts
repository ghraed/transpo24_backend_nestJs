import { BadGatewayException, BadRequestException } from '@nestjs/common';

import { GoogleTranslateProvider } from './google-translate.provider';
import { TranslationCacheService } from './translation-cache.service';
import { TranslationService } from './translations.service';

describe('TranslationService', () => {
  const createService = () => {
    const translateTextsMock = jest.fn();
    const buildTranslationCacheKeyMock = jest.fn(
      ({ sourceLanguage, targetLanguage, text }) =>
        sourceLanguage + ':' + targetLanguage + ':' + text,
    );
    const getCacheMock = jest.fn();
    const setCacheMock = jest.fn();

    const provider = {
      translateTexts: translateTextsMock,
    } as unknown as GoogleTranslateProvider;

    const cache = {
      cacheTtlSeconds: 3600,
      buildTranslationCacheKey: buildTranslationCacheKeyMock,
      get: getCacheMock,
      set: setCacheMock,
    } as unknown as TranslationCacheService;

    return {
      service: new TranslationService(provider, cache),
      mocks: {
        translateTextsMock,
        buildTranslationCacheKeyMock,
        getCacheMock,
        setCacheMock,
      },
    };
  };

  it('returns a translated string and caches it', async () => {
    const { service, mocks } = createService();
    mocks.getCacheMock.mockResolvedValue(null);
    mocks.translateTextsMock.mockResolvedValue([
      { translatedText: 'Le chauffeur est en route' },
    ]);

    await expect(
      service.translate({
        text: 'Driver is on the way',
        sourceLanguage: 'en',
        targetLanguage: 'fr',
      }),
    ).resolves.toEqual({
      originalText: 'Driver is on the way',
      translatedText: 'Le chauffeur est en route',
      sourceLanguage: 'en',
      targetLanguage: 'fr',
    });

    expect(mocks.translateTextsMock).toHaveBeenCalledWith({
      texts: ['Driver is on the way'],
      sourceLanguage: 'en',
      targetLanguage: 'fr',
    });
    expect(mocks.setCacheMock).toHaveBeenCalledWith(
      'en:fr:Driver is on the way',
      'Le chauffeur est en route',
      3600,
    );
  });

  it('translates batches and reuses duplicate inputs in a single provider call', async () => {
    const { service, mocks } = createService();
    mocks.getCacheMock.mockResolvedValue(null);
    mocks.translateTextsMock.mockResolvedValue([
      { translatedText: "Accepter l'offre" },
      { translatedText: 'Le chauffeur est arrive' },
    ]);

    await expect(
      service.translateBatch({
        texts: ['Accept offer', 'Driver arrived', 'Accept offer'],
        sourceLanguage: 'en',
        targetLanguage: 'fr',
      }),
    ).resolves.toEqual({
      translations: [
        {
          originalText: 'Accept offer',
          translatedText: "Accepter l'offre",
          sourceLanguage: 'en',
          targetLanguage: 'fr',
        },
        {
          originalText: 'Driver arrived',
          translatedText: 'Le chauffeur est arrive',
          sourceLanguage: 'en',
          targetLanguage: 'fr',
        },
        {
          originalText: 'Accept offer',
          translatedText: "Accepter l'offre",
          sourceLanguage: 'en',
          targetLanguage: 'fr',
        },
      ],
    });

    expect(mocks.translateTextsMock).toHaveBeenCalledTimes(1);
    expect(mocks.translateTextsMock).toHaveBeenCalledWith({
      texts: ['Accept offer', 'Driver arrived'],
      sourceLanguage: 'en',
      targetLanguage: 'fr',
    });
  });

  it('rejects unsupported languages', async () => {
    const { service } = createService();

    await expect(
      service.translate({
        text: 'Driver is on the way',
        sourceLanguage: 'en',
        targetLanguage: 'it',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects empty input', async () => {
    const { service } = createService();

    await expect(
      service.translate({
        text: '   ',
        sourceLanguage: 'en',
        targetLanguage: 'ar',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('surfaces Google API failures as NestJS exceptions', async () => {
    const { service, mocks } = createService();
    mocks.getCacheMock.mockResolvedValue(null);
    mocks.translateTextsMock.mockRejectedValue(
      new BadGatewayException('Translation request failed.'),
    );

    await expect(
      service.translate({
        text: 'Driver is on the way',
        sourceLanguage: 'en',
        targetLanguage: 'de',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('returns cached translations without calling Google', async () => {
    const { service, mocks } = createService();
    mocks.getCacheMock.mockResolvedValue('El conductor esta en camino');

    await expect(
      service.translate({
        text: 'Driver is on the way',
        sourceLanguage: 'en',
        targetLanguage: 'es',
      }),
    ).resolves.toEqual({
      originalText: 'Driver is on the way',
      translatedText: 'El conductor esta en camino',
      sourceLanguage: 'en',
      targetLanguage: 'es',
    });

    expect(mocks.translateTextsMock).not.toHaveBeenCalled();
    expect(mocks.setCacheMock).not.toHaveBeenCalled();
  });
});
