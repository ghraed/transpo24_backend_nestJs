import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { scanError } from './registration.errors';
import { REGISTRATION_PROMPT, validateExtraction } from './registration.schema';
import type { RegistrationExtraction } from './registration.types';

@Injectable()
export class QwenRegistrationProvider {
  constructor(private readonly config: ConfigService) {}

  assertConfigured(): { endpoint: string; apiKey: string; model: string } {
    const apiKey = this.config.get<string>('QWEN_API_KEY')?.trim();
    const base = this.config.get<string>('QWEN_BASE_URL')?.trim();
    const model =
      this.config.get<string>('QWEN_MODEL')?.trim() || 'qwen3-vl-plus';
    try {
      if (!apiKey || !base || /replace_with|your.*key/i.test(apiKey))
        throw new Error();
      const url = new URL(base);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        /[{}]/.test(base)
      )
        throw new Error();
      return {
        endpoint: `${base.replace(/\/$/, '')}/chat/completions`,
        apiKey,
        model,
      };
    } catch {
      throw scanError('REGISTRATION_CONFIGURATION', 503);
    }
  }

  async extract(
    images: Buffer[],
    clientSignal?: AbortSignal,
  ): Promise<RegistrationExtraction> {
    const { endpoint, apiKey, model } = this.assertConfigured();
    const body = JSON.stringify({
      model,
      enable_thinking: false,
      stream: false,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: REGISTRATION_PROMPT },
            ...images.map((buffer) => ({
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${buffer.toString('base64')}`,
              },
            })),
          ],
        },
      ],
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      const timeout = AbortSignal.timeout(30000);
      const signal = clientSignal
        ? AbortSignal.any([timeout, clientSignal])
        : timeout;
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body,
          signal,
          redirect: 'error',
        });
        if (!response.ok) {
          await response.body?.cancel();
          if ([401, 403, 400, 404, 422].includes(response.status))
            throw scanError('REGISTRATION_CONFIGURATION', 503);
          if (
            (response.status === 429 || response.status >= 500) &&
            attempt === 0
          ) {
            await this.delay(clientSignal);
            continue;
          }
          throw scanError(
            response.status === 429
              ? 'REGISTRATION_RATE_LIMIT'
              : 'REGISTRATION_UNAVAILABLE',
            response.status === 429 ? 429 : 503,
          );
        }
        const reader = response.body?.getReader();
        if (!reader) throw scanError('REGISTRATION_INVALID_OUTPUT', 502);
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.length;
            if (size > 128 * 1024)
              throw scanError('REGISTRATION_INVALID_OUTPUT', 502);
            chunks.push(chunk.value);
          }
        } finally {
          await reader.cancel().catch(() => undefined);
          reader.releaseLock();
        }
        try {
          const payload = JSON.parse(
            Buffer.concat(chunks).toString('utf8'),
          ) as {
            choices?: {
              finish_reason?: string;
              message?: { content?: unknown };
            }[];
          };
          const choice = payload?.choices?.[0];
          if (
            choice?.finish_reason !== 'stop' ||
            typeof choice.message?.content !== 'string' ||
            !choice.message.content.trim()
          )
            throw new Error();
          return validateExtraction(
            JSON.parse(choice.message.content),
            images.length,
          );
        } catch {
          throw scanError('REGISTRATION_INVALID_OUTPUT', 502);
        }
      } catch (error) {
        if (error instanceof HttpException) throw error;
        if (clientSignal?.aborted)
          throw scanError('REGISTRATION_CANCELLED', 400);
        if (attempt === 0) {
          await this.delay(clientSignal);
          continue;
        }
        throw scanError(
          timeout.aborted ? 'REGISTRATION_TIMEOUT' : 'REGISTRATION_UNAVAILABLE',
          timeout.aborted ? 504 : 503,
        );
      }
    }
    throw scanError('REGISTRATION_UNAVAILABLE', 503);
  }

  private async delay(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw scanError('REGISTRATION_CANCELLED', 400);
    await new Promise<void>((resolve) => {
      const abort = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', abort);
        resolve();
      }, 500);
      signal?.addEventListener('abort', abort, { once: true });
    });
    if (signal?.aborted) throw scanError('REGISTRATION_CANCELLED', 400);
  }
}
