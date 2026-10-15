import { Injectable, Optional } from '@nestjs/common';
import sharp from 'sharp';
import { renderRegistrationPdf } from './registration-pdf';
import { MAX_REGISTRATION_PAGES } from './registration.types';
import { VehiclesService } from '../vehicles.service';
import { separatePrintedMakeModel } from './registration-ocr';
import { scanError } from './registration.errors';
import { QwenRegistrationProvider } from './qwen-registration.provider';

export const MAX_REGISTRATION_IMAGE_BYTES = 8 * 1024 * 1024;

@Injectable()
export class RegistrationService {
  constructor(
    private readonly provider: QwenRegistrationProvider,
    @Optional() private readonly vehicles?: VehiclesService,
  ) {}

  async extract(files: Express.Multer.File[], signal?: AbortSignal) {
    const images: Buffer[] = [];
    try {
      if (!files?.length || files.length > 2)
        throw scanError('REGISTRATION_INVALID_UPLOAD', 400);
      this.provider.assertConfigured();
      for (const file of files) {
        if (
          !file.buffer?.length ||
          file.buffer.length > MAX_REGISTRATION_IMAGE_BYTES
        )
          throw scanError('REGISTRATION_INVALID_UPLOAD', 400);
        const b = file.buffer;
        if (b.toString('ascii', 0, 5) === '%PDF-') {
          try {
            images.push(
              ...(await renderRegistrationPdf(
                b,
                MAX_REGISTRATION_PAGES - images.length,
                signal,
              )),
            );
          } catch {
            throw scanError('REGISTRATION_INVALID_UPLOAD', 400);
          }
          continue;
        }
        if (images.length >= MAX_REGISTRATION_PAGES)
          throw scanError('REGISTRATION_INVALID_UPLOAD', 400);
        const jpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
        const png = b
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        const webp =
          b.toString('ascii', 0, 4) === 'RIFF' &&
          b.toString('ascii', 8, 12) === 'WEBP';
        if (!jpeg && !png && !webp)
          throw scanError('REGISTRATION_INVALID_UPLOAD', 400);
        // Some PNG decoders expose only the first APNG frame; reject animation explicitly.
        if (png) {
          let offset = 8;
          while (offset + 12 <= b.length) {
            const length = b.readUInt32BE(offset);
            if (
              length > b.length - offset - 12 ||
              b.toString('ascii', offset + 4, offset + 8) === 'acTL'
            )
              throw scanError('REGISTRATION_INVALID_UPLOAD', 400);
            offset += length + 12;
          }
        }
        try {
          const image = sharp(b, {
            limitInputPixels: 48000000,
            failOn: 'warning',
          });
          const metadata = await image.metadata();
          if (
            !['jpeg', 'png', 'webp'].includes(metadata.format ?? '') ||
            (metadata.pages ?? 1) !== 1 ||
            !metadata.width ||
            !metadata.height ||
            metadata.width < 64 ||
            metadata.height < 64 ||
            metadata.width > 12000 ||
            metadata.height > 12000 ||
            metadata.width * metadata.height > 48000000
          )
            throw new Error();
          const normalized = await image
            .autoOrient()
            .resize({
              width: 3000,
              height: 3000,
              fit: 'inside',
              withoutEnlargement: true,
            })
            .flatten({ background: '#ffffff' })
            .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
            .toBuffer();
          if (normalized.length > MAX_REGISTRATION_IMAGE_BYTES)
            throw new Error();
          images.push(normalized);
        } catch {
          throw scanError('REGISTRATION_INVALID_UPLOAD', 400);
        }
      }
      const result = await this.provider.extract(images, signal);
      if (
        this.vehicles &&
        result.fields.brand.value &&
        result.fields.model.value
      ) {
        const brands = await this.vehicles.listBrands().catch(() => []);
        return separatePrintedMakeModel(result, brands);
      }
      return result;
    } finally {
      for (const buffer of images) buffer.fill(0);
      images.length = 0;
      for (const file of files ?? []) {
        file.buffer?.fill(0);
        file.buffer = Buffer.alloc(0);
      }
    }
  }
}
