import { BadRequestException } from '@nestjs/common';
import { basename, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import sharp from 'sharp';

export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const DOCUMENT_TYPES = [
  'PICKUP_AUTHORIZATION',
  'INSURANCE',
  'PURCHASE_PROOF',
  'OTHER',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export type IncomingFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};
export async function validateFile(file?: IncomingFile, allowWebp = false) {
  if (!file?.buffer?.length || file.buffer.length > MAX_FILE_SIZE) {
    throw new BadRequestException('Choose a PDF, JPG or PNG file up to 10 MB.');
  }
  let bytes = file.buffer;
  const mimeType =
    bytes.subarray(0, 5).toString() === '%PDF-'
      ? 'application/pdf'
      : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        ? 'image/jpeg'
        : bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? 'image/png'
          : allowWebp &&
              bytes.toString('ascii', 0, 4) === 'RIFF' &&
              bytes.toString('ascii', 8, 12) === 'WEBP'
            ? 'image/webp'
            : null;
  const extension =
    mimeType === 'application/pdf'
      ? '.pdf'
      : mimeType === 'image/jpeg'
        ? '.jpg'
        : mimeType === 'image/webp'
          ? '.webp'
          : '.png';
  if (
    !mimeType ||
    (file.mimetype &&
      file.mimetype !== 'application/octet-stream' &&
      file.mimetype !== mimeType)
  ) {
    throw new BadRequestException(
      'Only genuine PDF, JPG and PNG files are supported.',
    );
  }
  try {
    if (mimeType === 'application/pdf') {
      const valid = await new Promise<boolean>((resolveValidation) => {
        const worker = new Worker(
          resolve(__dirname, 'pdf-validation.worker.cjs'),
          {
            workerData: new Uint8Array(bytes),
            resourceLimits: { maxOldGenerationSizeMb: 96, stackSizeMb: 4 },
          },
        );
        const finish = (valid: boolean) => {
          clearTimeout(timer);
          void worker.terminate();
          resolveValidation(valid);
        };
        const timer = setTimeout(() => finish(false), 5000);
        worker.once('message', (value) => finish(value === true));
        worker.once('error', () => finish(false));
        worker.once('exit', () => finish(false));
      });
      if (!valid) throw Error();
    } else {
      const image = sharp(bytes, {
        limitInputPixels: 48_000_000,
        failOn: 'warning',
      });
      const meta = await image.metadata();
      if (
        !meta.width ||
        !meta.height ||
        meta.width > 12000 ||
        meta.height > 12000 ||
        (meta.pages ?? 1) !== 1
      )
        throw Error();
      // Full decode/re-encode strips metadata, active/polyglot tails and unsafe filenames.
      bytes = await image
        .rotate()
        .toFormat(
          mimeType === 'image/jpeg'
            ? 'jpeg'
            : mimeType === 'image/png'
              ? 'png'
              : 'webp',
        )
        .toBuffer();
      if (bytes.length > MAX_FILE_SIZE) throw Error();
    }
  } catch {
    throw new BadRequestException(
      'The document is malformed, encrypted, active, or exceeds supported decoding limits.',
    );
  }
  const original = basename(file.originalname.replace(/\\/g, '/'))
    .split('')
    .filter(
      (character) =>
        character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
    )
    .join('')
    .trim();
  const fileName =
    (original.replace(/\.[^.]*$/, '').slice(0, 140) || 'document') + extension;
  return {
    fileName,
    mimeType,
    size: bytes.length,
    data: new Uint8Array(bytes),
  };
}
