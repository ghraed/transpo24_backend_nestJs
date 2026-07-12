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
