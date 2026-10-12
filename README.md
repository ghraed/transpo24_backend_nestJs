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

## Customer authentication with Twilio Verify SMS

Customer registration and login use the same two endpoints: an SMS verification is sent, and an approved code either signs in the existing customer for that E.164 phone number or creates a customer. Driver and admin email/password authentication is unchanged.

Create a Verify Service in Twilio Console under **Verify > Services**, open it, and copy its `VA...` Service SID. Configure SMS for that Verify service, then set these backend-only values in `.env`:

```env
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_VERIFY_SERVICE_SID=
```

For Google Play review, the app-access form must contain reusable credentials because a reviewer
may not be able to receive an SMS. Configure one dedicated review phone number and six-digit code
on the API, then enter the same values in Play Console under **App content → App access**:

```env
PLAY_REVIEW_PHONE_NUMBER=+<dedicated E.164 number>
PLAY_REVIEW_OTP_CODE=<six-digit secret>
```

Both variables are optional but must be set together. They only bypass Twilio for the exact review
phone number, are never returned by the API, and the code is compared in constant time. Use a
dedicated non-admin customer account, ensure it has representative data for review, do not commit
the values, and rotate or remove them after the review is complete.

Never use `EXPO_PUBLIC_` for these values and never commit real credentials. The API refuses to start if the required Twilio values are missing.

Twilio trial accounts can send Verify OTPs only to recipient numbers verified in the Twilio Console. Twilio Verify selects the SMS sender automatically; do not set a fixed `from` number or include a purchased phone number in the Verify API request. Check the current [Twilio Verify SMS guide](https://www.twilio.com/docs/verify/sms) and [Verify API prerequisites](https://www.twilio.com/docs/verify/api/verification) before deployment.

Phone numbers are independently normalized by both clients and the API and stored in E.164. Redis is used for shared OTP request/attempt throttling when configured; local development falls back to an in-process limiter. Twilio stores the OTP itself—the application database does not.

Apply the additive migration and run verification with:

```bash
npm install
npx prisma migrate deploy
npx prisma generate
npm run build
npm test -- --runInBand
```

The migration adds nullable unique `User.phoneNumber`, `User.isProfileCompleted`, and revocable `refresh_sessions`. It does not delete, merge, or rewrite existing users, emails, or password hashes. Existing rows receive `isProfileCompleted = true`; their phone number remains `NULL` until deliberately linked. Before production deployment, audit any customer phone data held outside `User.phoneNumber` and explicitly backfill normalized, conflict-free values if applicable.

Customer auth endpoints:

- `POST /auth/phone/send-code`
- `POST /auth/phone/verify-code`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/phone/complete-profile` (customer access token required)

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

## VIN decoding providers

The authenticated `GET /vehicles/decode-vin/:vin` endpoint first searches
SwissCarInfo and calls One Auto API only after SwissCarInfo returns an explicit
not-found or empty result. Authentication, quota, timeout, network, malformed
response, and server failures from SwissCarInfo are returned as controlled
service errors and do not spend One Auto API credits.

Configure these backend-only variables:

```env
SWISSCARINFO_API_KEY=
SWISSCARINFO_API_URL=https://api.swisscarinfo.ch/v3/search
SWISSCARINFO_TIMEOUT_MS=10000
ONEAUTOAPI_API_KEY=
ONEAUTOAPI_API_URL=https://api.oneautoapi.com/oneauto/vindecodebasic/us/v2
ONEAUTOAPI_TIMEOUT_MS=10000
```

[SwissCarInfo](https://swisscarinfo.ch/en/api) requires API access and a key
from the account API dashboard. [One Auto API](https://swagger.oneautoapi.com/)
requires the VIN Decode (US) method to be enabled and an API key whose
service/IP restrictions allow the API deployment. Keep both keys on the API
server; do not use an `EXPO_PUBLIC_` variable for either one.

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

## Production verification

The release gate runs unit tests with coverage, HTTP contract tests, and a
production build:

```bash
npm run test:ci
npx prisma validate
npx prisma migrate status
```

The HTTP contract suite covers validation and unknown-field rejection,
authentication and role boundaries, CORS, security headers, sanitized errors,
push-token input, production-disabled test routes, and health probes. Unit tests
cover authentication/session rotation, OTP throttling, payments and Stripe,
driver/trip workflows, notifications, chat, translations, vehicle lookup, and
environment validation. Coverage thresholds prevent the current baseline from
regressing; raise them as legacy services receive deeper scenario coverage.

Production requires explicit `DATABASE_URL`, Twilio Verify credentials, a
unique `ACCESS_TOKEN_SECRET` of at least 32 characters, exact `CORS_ORIGINS`,
Stripe live credentials, and an HTTPS `DRIVER_APP_BASE_URL`. The process fails
fast when these are missing or unsafe. Keep `ENABLE_TEST_ENDPOINTS=false`.

Infrastructure probes:

- `GET /health/live` checks that the API process is running.
- `GET /health/ready` checks that PostgreSQL accepts a query.

Before routing real traffic, apply migrations, test Stripe and Twilio in the
target account, verify Redis availability and queue workers, exercise upload
storage persistence, and confirm backup/restore and monitoring alerts in the
deployment environment. Automated tests cannot certify those external systems.

## Registration-card extraction

The customer vehicle form uploads registration-card photos to
`POST /vehicles/extract-registration`. The endpoint requires an active customer
Bearer token and accepts multipart `images` (one or two images, at most 8 MiB
each). It rejects extra fields, image URLs and caller-supplied user/tenant IDs.
This branch has customer ownership boundaries rather than a tenant identifier;
the rate-limit identity comes exclusively from the authenticated customer.

Configure these **backend-only** variables locally or in the server environment:

```dotenv
QWEN_API_KEY=<your Model Studio API key>
QWEN_BASE_URL=<the HTTPS OpenAI-compatible base URL for your region/workspace>
QWEN_MODEL=qwen3-vl-plus
```

The base URL must omit `/chat/completions`; the adapter appends that path. There
is no default region. Select the endpoint that matches your key and model access
using the [official regional endpoint reference](https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions).
For example, current workspace endpoints use
`https://<workspace-id>.<region>.maas.aliyuncs.com/compatible-mode/v1`.
Never place these variables in either mobile app or an `EXPO_PUBLIC_` variable.
Scanning returns `REGISTRATION_CONFIGURATION` when unavailable; other features
continue to operate. Native `fetch` sends Base64 JPEG inputs with a structured extraction prompt,
following the [Qwen-OCR API reference](https://www.alibabacloud.com/help/en/model-studio/qwen-vl-ocr-api-reference).
The default `qwen3-vl-plus` model interprets registration-card rows and returns
structured JSON with thinking disabled, following the
[Qwen structured-output reference](https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output).
OCR-only models remain configurable, but their plain transcription can confuse
adjacent rows or VIN characters. The OCR-specific `max_pixels` option is sent
only to OCR models; it is excluded from structured vision requests.
Plain JSON, JSON wrapped in a Markdown fence, and JSON surrounded by model
explanations are parsed and validated. Output formatting failures get one
automatic retry with the same images and a format correction.
Qwen maps labels in any language to consistent English JSON field keys while
preserving printed make and complete model values. A label-based parser also
accepts plain OCR text. Combined make/type lines can be split using the
manufacturer catalog. Example vehicle values are excluded from the OCR prompt.
An empty partial response gets one automatic retry with a format correction.
Identity values that are row headings or generic body descriptions are rejected.
If make/model is suspect, or a readable make/model has no valid VIN, the second
attempt re-reads printed vehicle rows. It recovers missing identity fields while
preserving already validated weight/year values; a failed recovery still returns
the validated partial result. Swiss multilingual row labels and leading weight
padding asterisks are supported without guessing missing or ambiguous digits.
Image pixel limits are raised to preserve small printed characters.
Direct values and legacy evidence objects are both accepted. VIN, Swiss number,
year and weight are checked for format and range; invalid fields stay empty
without discarding readable fields. Evidence is retained when supplied and
never fabricated. Weight and year are extracted only when explicitly printed,
as instructed in the OCR prompt; users review the filled fields.
A different configured model must support image inputs and the extraction schema.

Successful HTTP responses use status **201** and this contract:

```typescript
type RegistrationExtraction = {
  status: 'extracted' | 'partial' | 'wrong_document' | 'unreadable';
  fields: Record<
    'vin' | 'swissRegistrationNumber' | 'brand' | 'model' |
    'manufactureYear' | 'emptyWeightKg' | 'bodyType' | 'transmission',
    {
      value: string | number | null;
      status: 'extracted' | 'missing' | 'ambiguous' | 'invalid';
      evidence: {
        imageIndex: number; // zero-based, within the uploaded images
        label: string;
        printedValue: string;
        unit: string | null;
      }[];
    }
  >;
  missingFields: string[];
  warnings: { code: string; field?: string }[];
};
```

All eight fields are always returned. Year and empty weight use numbers when
usable; other values use strings. Missing/uncertain values are null. Older or
nonstandard chassis numbers are not applied; evidence-backed values can retain
`invalid` status and a warning for review. Evidence, when available, uses the
original printed label/value. The existing `manufactureYear` key supplies the
vehicle form's year: prefer an explicit manufacture year; when absent, use the
printed first-registration date. Full dates in day/month/year or year/month/day
order are validated and normalized to a four-digit year. Model year, document
issue/expiry dates and inspection dates are excluded, as are gross weight,
payload and mass in service from empty weight. Legacy evidence-backed responses additionally
check recognized printed weight/year labels and units. A plate number cannot
supply the nine-digit Swiss registration identifier.

Errors use the existing JSON error envelope with stable codes:
`REGISTRATION_INVALID_UPLOAD` (400/413), `REGISTRATION_CONFIGURATION` (503),
`REGISTRATION_TIMEOUT` (504), `REGISTRATION_RATE_LIMIT` (429),
`REGISTRATION_UNAVAILABLE` (503), `REGISTRATION_INVALID_OUTPUT` (502), and
`REGISTRATION_CANCELLED` (400). Authentication retains the existing 401/403
boundary. Wrong/unreadable documents are normal typed results.

The endpoint accepts actual JPEG, PNG and static WebP data and normalizes it
using `sharp`. It rejects animations, corrupt content, dimensions outside
64–12,000 pixels per side, or over 48 megapixels. Normalized images have a
maximum 4,000-pixel edge and stripped metadata. Buffers are processed in memory
and cleared on success/failure. Nothing is saved to public uploads, the database,
or request documents. Images, keys, Base64, and model/document output are never
logged. Redis counters allow five attempts per minute and twenty per hour per
customer; the existing in-process fallback applies when Redis is unavailable.
Use Redis for limits shared across server instances. The adapter makes at most
two attempts, 30 seconds each, with a bounded transient retry delay.

Install dependencies with `npm install` (the feature adds `sharp`); no database
migration is needed. Automated tests use synthetic images and mocked Qwen:

```bash
npm run test:unit -- --testPathPatterns=registration
npm run test:e2e -- --testPathPatterns=registration
npm run build
```

For a real-photo test, configure the server variables, start the API, rebuild
the customer development app, and open a Vehicle transport request. Tap
**Scan registration card**, capture/select the front and optionally the reverse,
check the preview, then tap **Extract details / Retry**. Readable values fill
the main vehicle fields automatically, including empty weight in kilograms.
Make and model are separate (for example, Ford / Transit Courier). Catalog
matches retain their IDs; unmatched names appear in editable text fields.
Compare the filled fields with the card and correct or complete them. Missing
or uncertain values preserve existing inputs, as do edits made during a scan.
Continue through the ordinary request review and submission. Extraction alone
does not create a request or verify a vehicle. A live Qwen call and physical
camera test must be reported separately from mocked/bundle tests.

Registration scan diagnostics use the prefix `Registration OCR parser=4` in
the API terminal. They show image count, configured model, completion reason,
response length, field-shape counts, validation stage and readable field count.
They never log document text, extracted values, image data or API keys. For a
failed device scan, share these lines; in development, Metro also reports
whether the failure came from an API error or client response validation, and
the API origin used by the request.
