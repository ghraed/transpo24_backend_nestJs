# Transpo24 API

## Setup

```bash
npm install
cp .env.example .env
```

Generate browser Web Push VAPID keys locally:

```bash
npx web-push generate-vapid-keys
```

Set these values in `.env`:

```env
WEB_PUSH_VAPID_PUBLIC_KEY=
WEB_PUSH_VAPID_PRIVATE_KEY=
WEB_PUSH_VAPID_SUBJECT=mailto:admin@transpo24.com
```

Do not expose the private VAPID key to the frontend. Browser Web Push requires HTTPS in production.

## Google Cloud Translation

Install dependencies, then configure one of these backend-only authentication modes:

1. Local development with a service-account file path:

```env
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/google-translate-service-account.json
```

2. Production deployment with environment variables only:

```env
GOOGLE_TRANSLATE_PROJECT_ID=your-gcp-project-id
GOOGLE_TRANSLATE_CLIENT_EMAIL=service-account@your-project.iam.gserviceaccount.com
GOOGLE_TRANSLATE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Optional alternative:

```env
GOOGLE_TRANSLATE_CREDENTIALS_JSON='{"type":"service_account",...}'
```

Never expose Google credentials to the mobile apps. Keep service-account JSON files outside version control; the project gitignore now ignores common Google credential filenames.

Authenticated translation endpoints:

- `POST /translations`
- `POST /translations/batch`

Supported languages:

- `en`
- `ar`
- `fr`
- `de`
- `es`

Single-translation request body:

```json
{
  "text": "Driver is on the way",
  "targetLanguage": "ar",
  "sourceLanguage": "en"
}
```

Single-translation response body:

```json
{
  "originalText": "Driver is on the way",
  "translatedText": "...",
  "sourceLanguage": "en",
  "targetLanguage": "ar"
}
```

Batch-translation request body:

```json
{
  "texts": ["Accept offer", "Driver arrived"],
  "targetLanguage": "fr",
  "sourceLanguage": "en"
}
```

The translation module validates supported languages, empty input, maximum text length, and maximum batch size. Responses are cached by source language, target language, and a SHA-256 hash of the source text. If Redis is configured but unavailable, translation caching and rate limiting fall back to in-memory storage so requests still succeed safely.

Rate limiting is controlled by:

```env
TRANSLATION_CACHE_TTL_SECONDS=86400
TRANSLATION_RATE_LIMIT_WINDOW_SECONDS=60
TRANSLATION_RATE_LIMIT_MAX_REQUESTS=30
```

## Database

Apply the schema changes:

```bash
npx prisma migrate dev
npx prisma generate
```

The Web Push migration adds `web_push_subscriptions`, which stores one or more browser subscriptions per authenticated admin user. Expired subscriptions are removed automatically after permanent `404` or `410` Web Push responses.

## Browser Web Push API

Authenticated admin endpoints:

- `POST /notifications/web-push/subscriptions`
- `DELETE /notifications/web-push/subscriptions`
- `GET /notifications/web-push/subscriptions/me`

`POST` request body:

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/...",
  "expirationTime": null,
  "keys": {
    "p256dh": "base64-key",
    "auth": "base64-auth"
  },
  "userAgent": "Mozilla/5.0 ..."
}
```

`DELETE` request body:

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/..."
}
```

Browser notification payload contract:

```json
{
  "id": "uuid",
  "type": "DRIVER_REVIEW_SUBMITTED",
  "title": "New driver review request",
  "body": "A driver submitted onboarding documents for review.",
  "url": "/driver-reviews",
  "tag": "driver_review_submitted",
  "data": {
    "driverProfileId": "..."
  }
}
```

The backend keeps Socket.IO and existing Expo mobile delivery unchanged. Browser Web Push is an additional admin channel and currently not a replacement for socket delivery.

## Development

```bash
npm run format
npm run lint
npm run build
npm run test
```
