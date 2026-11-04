import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { dirname, basename, extname, join } from 'node:path';
import { validateFile } from './file-validation';

@Injectable()
export class ValidateDiskUploadsInterceptor implements NestInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest<{
      file?: Express.Multer.File;
      files?: Express.Multer.File[] | Record<string, Express.Multer.File[]>;
    }>();
    const files: Express.Multer.File[] = req.file
      ? [req.file]
      : Array.isArray(req.files)
        ? req.files
        : Object.values(req.files ?? {}).flat();
    try {
      for (const file of files) {
        if (!file.path) continue;
        const validated = await validateFile(
          { ...file, buffer: await readFile(file.path) },
          true,
        );
        const extension =
          validated.mimeType === 'application/pdf'
            ? '.pdf'
            : validated.mimeType === 'image/png'
              ? '.png'
              : validated.mimeType === 'image/webp'
                ? '.webp'
                : '.jpg';
        const safePath = join(
          dirname(file.path),
          basename(file.path, extname(file.path)) + extension,
        );
        await writeFile(safePath, validated.data);
        if (safePath !== file.path) await unlink(file.path);
        file.path = safePath;
        file.filename = basename(safePath);
        file.mimetype = validated.mimeType;
        file.originalname = validated.fileName;
        file.size = validated.size;
      }
    } catch (error) {
      await Promise.all(
        files
          .filter((file) => file.path)
          .map((file) => unlink(file.path).catch(() => undefined)),
      );
      throw error;
    }
    return next.handle();
  }
}
