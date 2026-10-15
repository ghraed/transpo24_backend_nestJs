import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { scanError } from './registration.errors';
import {
  normalizeRegistrationOutput,
  REGISTRATION_JSON_SCHEMA,
} from './registration.schema';
import {
  REGISTRATION_OCR_PROMPT,
  REGISTRATION_IDENTITY_RETRY_PROMPT,
  REGISTRATION_IDENTITY_JSON_RETRY_PROMPT,
  parseRegistrationOcrText,
} from './registration-ocr';
import {
  REGISTRATION_FIELDS,
  type RegistrationExtraction,
} from './registration.types';

@Injectable()
export class QwenRegistrationProvider {
  private readonly logger = new Logger(QwenRegistrationProvider.name);
  constructor(private readonly config: ConfigService) {}

  assertConfigured(): { endpoint: string; apiKey: string; model: string } {
    const apiKey = this.config.get<string>('QWEN_API_KEY')?.trim();
    const base = this.config.get<string>('QWEN_BASE_URL')?.trim();
    const model =
      this.config.get<string>('QWEN_MODEL')?.trim() || 'qwen3.7-plus';
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
    const structuredVision =
      /^qwen(?:3-vl|3\.[567])-(?:plus|flash)(?:-|$)/.test(model);
    this.logger.log(
      `Registration OCR parser=9 started images=${images.length} model=${model}`,
    );
    const request = {
      model,
      stream: false,
      max_tokens: 4096,
      ...(structuredVision
        ? {
            enable_thinking: false,
            temperature: 0,
            response_format: /^qwen3\.7-(?:plus|flash)(?:-|$)/.test(model)
              ? { type: 'json_schema', json_schema: REGISTRATION_JSON_SCHEMA }
              : { type: 'json_object' },
          }
        : {}),
      messages: [
        {
          role: 'user',
          content: [
            ...images.map((buffer) => ({
              type: 'image_url',
              ...(/^qwen-vl-ocr(?:-|$)/.test(model)
                ? { max_pixels: 23520000 }
                : {}),
              image_url: {
                url: `data:image/jpeg;base64,${buffer.toString('base64')}`,
              },
            })),
            { type: 'text', text: REGISTRATION_OCR_PROMPT },
          ],
        },
      ],
    };
    const deadline = Date.now() + 120_000;
    let recoveryCandidate: RegistrationExtraction | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const candidate = recoveryCandidate;
      const identityRecovery =
        candidate &&
        (['brand', 'model', 'vin'] as const).some(
          (name) => candidate.fields[name].status !== 'extracted',
        );
      const body = JSON.stringify(
        attempt === 0
          ? request
          : {
              ...request,
              ...(recoveryCandidate &&
              /^qwen3\.7-(?:plus|flash)(?:-|$)/.test(model)
                ? { enable_thinking: true, thinking_budget: 1024 }
                : {}),
              messages: [
                {
                  ...request.messages[0],
                  content: [
                    ...request.messages[0].content.slice(0, -1),
                    {
                      type: 'text',
                      text: recoveryCandidate
                        ? structuredVision
                          ? identityRecovery
                            ? REGISTRATION_IDENTITY_JSON_RETRY_PROMPT
                            : REGISTRATION_OCR_PROMPT
                          : REGISTRATION_IDENTITY_RETRY_PROMPT
                        : REGISTRATION_OCR_PROMPT,
                    },
                    ...(recoveryCandidate &&
                    (!structuredVision || identityRecovery)
                      ? []
                      : [
                          {
                            type: 'text',
                            text: 'Read the original printed vehicle labels in any language. Return only the JSON object with status and fields using the exact field objects specified above, original printed labels, values, units and canonical evidence meanings. Re-read the empty-weight mass row independently of engine displacement. Preserve the full model and printed date. Do not return explanations.',
                          },
                        ]),
                  ],
                },
              ],
            },
      );
      // Multi-page documents need more first-pass time; all attempts share 120s.
      // Leave 30 seconds for upload/normalization within the mobile's 150s budget.
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        if (recoveryCandidate) return recoveryCandidate;
        throw scanError('REGISTRATION_TIMEOUT', 504);
      }
      const timeout = AbortSignal.timeout(
        Math.min(
          attempt === 0 ? (images.length > 2 ? 120_000 : 75_000) : 45_000,
          remaining,
        ),
      );
      const attemptStarted = Date.now();
      this.logger.log(
        `Registration OCR attempt=${attempt + 1} requestBytes=${Buffer.byteLength(body)}`,
      );
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
        this.logger.log(
          `Registration OCR attempt=${attempt + 1} http=${response.status} elapsedMs=${Date.now() - attemptStarted}`,
        );
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
        let stage = 'response_json';
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
          stage = 'completion';
          const content = choice?.message?.content;
          const finish = ['stop', 'length', 'content_filter'].includes(
            choice?.finish_reason ?? '',
          )
            ? choice?.finish_reason
            : 'other';
          this.logger.log(
            `Registration OCR parser=9 response attempt=${attempt + 1} finish=${finish} contentType=${typeof content} chars=${typeof content === 'string' ? content.length : 0}`,
          );
          if (
            choice?.finish_reason !== 'stop' ||
            typeof content !== 'string' ||
            !content.trim()
          )
            throw new Error();
          stage = 'content_json';
          let raw: unknown;
          try {
            raw = parseRegistrationContent(content);
          } catch {
            stage = 'printed_labels';
            const result = parseRegistrationOcrText(content, images.length);
            this.logger.log(
              `Registration OCR parser=9 accepted status=${result.status} readableFields=${REGISTRATION_FIELDS.filter((name) => result.fields[name].status === 'extracted').length}`,
            );
            if (
              !REGISTRATION_FIELDS.some(
                (name) => result.fields[name].status === 'extracted',
              ) &&
              attempt === 0
            )
              throw new Error();
            if (attempt === 0 && needsIdentityRecovery(result)) {
              recoveryCandidate = result;
              await this.delay(clientSignal);
              continue;
            }
            if (recoveryCandidate)
              return mergeIdentityRecovery(recoveryCandidate, result);
            return result;
          }
          const inputs =
            raw && typeof raw === 'object' && 'fields' in raw
              ? raw.fields
              : undefined;
          const fieldObject =
            inputs && typeof inputs === 'object' && !Array.isArray(inputs)
              ? (inputs as Record<string, unknown>)
              : {};
          const types = REGISTRATION_FIELDS.map(
            (name) => typeof fieldObject[name],
          );
          this.logger.log(
            `Registration OCR parser=9 shape knownFields=${REGISTRATION_FIELDS.filter((name) => Object.hasOwn(fieldObject, name)).length} objectFields=${types.filter((type) => type === 'object').length} stringFields=${types.filter((type) => type === 'string').length}`,
          );
          stage = 'schema';
          const result = normalizeRegistrationOutput(raw, images.length, true);
          this.logger.log(
            `Registration OCR parser=9 accepted status=${result.status} readableFields=${REGISTRATION_FIELDS.filter((name) => result.fields[name].status === 'extracted').length}`,
          );
          if (
            result.status === 'partial' &&
            !REGISTRATION_FIELDS.some(
              (name) => result.fields[name].status === 'extracted',
            ) &&
            attempt === 0
          )
            throw new Error();
          if (attempt === 0 && needsIdentityRecovery(result)) {
            recoveryCandidate = result;
            await this.delay(clientSignal);
            continue;
          }
          if (recoveryCandidate)
            return mergeIdentityRecovery(recoveryCandidate, result);
          return result;
        } catch {
          this.logger.warn(
            `Registration OCR parser=9 rejected stage=${stage} attempt=${attempt + 1}`,
          );
          if (
            attempt === 0 &&
            (stage === 'schema' ||
              stage === 'content_json' ||
              stage === 'printed_labels')
          ) {
            await this.delay(clientSignal);
            continue;
          }
          throw scanError('REGISTRATION_INVALID_OUTPUT', 502);
        }
      } catch (error) {
        this.logger.warn(
          `Registration OCR attempt=${attempt + 1} elapsedMs=${Date.now() - attemptStarted} timedOut=${timeout.aborted} cancelled=${clientSignal?.aborted ?? false}`,
        );
        if (clientSignal?.aborted)
          throw scanError('REGISTRATION_CANCELLED', 400);
        // A failed recovery attempt must not discard already validated fields.
        if (
          recoveryCandidate &&
          attempt === 1 &&
          (!(error instanceof HttpException) ||
            [
              'REGISTRATION_INVALID_OUTPUT',
              'REGISTRATION_UNAVAILABLE',
              'REGISTRATION_TIMEOUT',
              'REGISTRATION_RATE_LIMIT',
            ].includes((error.getResponse() as { code?: string }).code ?? ''))
        )
          return recoveryCandidate;
        if (error instanceof HttpException) throw error;
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

function needsIdentityRecovery(result: RegistrationExtraction): boolean {
  if (result.status !== 'partial') return false;
  return (
    result.warnings.some(
      (warning) =>
        warning.field === 'brand' ||
        warning.field === 'model' ||
        warning.field === 'swissRegistrationNumber' ||
        warning.field === 'emptyWeightKg' ||
        warning.field === 'manufactureYear',
    ) ||
    (result.fields.brand.status === 'extracted' &&
      (result.fields.vin.status !== 'extracted' ||
        result.fields.model.status !== 'extracted'))
  );
}

/** Recover missing fields, keeping make/model together and preserving readable details. */
function mergeIdentityRecovery(
  first: RegistrationExtraction,
  second: RegistrationExtraction,
): RegistrationExtraction {
  if (second.status === 'wrong_document' || second.status === 'unreadable')
    return first;
  const fields = { ...first.fields };
  const recovered = new Set<(typeof REGISTRATION_FIELDS)[number]>();
  const pairMissing =
    first.fields.brand.status !== 'extracted' ||
    first.fields.model.status !== 'extracted';
  for (const name of REGISTRATION_FIELDS) {
    if ((name === 'brand' || name === 'model') && pairMissing) {
      if (
        second.fields.brand.status === 'extracted' &&
        second.fields.model.status === 'extracted'
      ) {
        fields[name] = second.fields[name];
        recovered.add(name);
      }
    } else if (
      first.fields[name].status !== 'extracted' &&
      second.fields[name].status === 'extracted'
    ) {
      fields[name] = second.fields[name];
      recovered.add(name);
    }
  }
  const missingFields = REGISTRATION_FIELDS.filter(
    (name) =>
      fields[name].value === null || fields[name].status !== 'extracted',
  );
  return {
    fields,
    missingFields,
    status: missingFields.length ? 'partial' : 'extracted',
    warnings: first.warnings.filter(
      (warning) => !warning.field || !recovered.has(warning.field),
    ),
  };
}

/** Accept a JSON object surrounded by OCR formatting, without evaluating text. */
export function parseRegistrationContent(content: string): unknown {
  const text = content
    .trim()
    .replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    /* Locate one complete JSON object. */
  }
  const start = text.indexOf('{');
  if (start < 0) throw new Error('REGISTRATION_INVALID_OUTPUT');
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0)
      return JSON.parse(text.slice(start, i + 1)) as unknown;
  }
  throw new Error('REGISTRATION_INVALID_OUTPUT');
}
