import {
  Body,
  BadRequestException,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';

import { ContactDto } from './contact.dto';

const WINDOW_MS = 60 * 60 * 1000;
const MAX_SUBMISSIONS = 5;

@Controller('contact')
export class ContactController {
  private readonly attempts = new Map<
    string,
    { count: number; expiresAt: number }
  >();

  @Post()
  @HttpCode(200)
  async submit(@Body() body: ContactDto, @Req() request: Request) {
    if (body.website?.trim()) return { ok: true };
    if (body.name.trim().length < 2 || body.message.trim().length < 10) {
      throw new BadRequestException('Please enter your name and a message.');
    }

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.CONTACT_EMAIL_FROM;
    if (!apiKey || !from) {
      throw new ServiceUnavailableException(
        'Contact form is temporarily unavailable.',
      );
    }

    const now = Date.now();
    for (const [ip, entry] of this.attempts) {
      if (entry.expiresAt <= now) this.attempts.delete(ip);
    }
    const ip = request.ip ?? 'unknown';
    const entry = this.attempts.get(ip);
    if (entry && entry.count >= MAX_SUBMISSIONS) {
      throw new HttpException(
        'Too many messages. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.attempts.set(ip, {
      count: (entry?.count ?? 0) + 1,
      expiresAt: entry?.expiresAt ?? now + WINDOW_MS,
    });

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: ['info@transpo24.com'],
          reply_to: body.email.trim(),
          subject: `Website contact from ${body.name.trim().replace(/[\r\n]/g, ' ')}`,
          text: `Name: ${body.name.trim()}\nEmail: ${body.email.trim()}\n\n${body.message.trim()}`,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok)
        throw new Error(`Email provider returned ${response.status}`);
      return { ok: true };
    } catch (error) {
      // Do not log message contents or provider credentials.
      console.error(
        'Contact email delivery failed:',
        error instanceof Error ? error.message : 'unknown error',
      );
      throw new ServiceUnavailableException(
        'Unable to send your message right now.',
      );
    }
  }
}
