import { BadRequestException } from '@nestjs/common';
import { basename } from 'node:path';

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
export function validateFile(file?: IncomingFile) {
  if (!file?.buffer?.length || file.buffer.length > MAX_FILE_SIZE) {
    throw new BadRequestException('Choose a PDF, JPG or PNG file up to 10 MB.');
  }
  const bytes = file.buffer;
  const mimeType =
    bytes.subarray(0, 5).toString() === '%PDF-'
      ? 'application/pdf'
      : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        ? 'image/jpeg'
        : bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? 'image/png'
          : null;
  const extension =
    mimeType === 'application/pdf'
      ? '.pdf'
      : mimeType === 'image/jpeg'
        ? '.jpg'
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
