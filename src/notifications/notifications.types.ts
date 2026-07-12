import type { PushApp } from '@prisma/client';

export type NotificationRecipientApp = PushApp;

export type PushNotificationType = string;

export interface SendPushNotificationInput {
  userIds: string[];
  app: NotificationRecipientApp;
  title: string;
  body: string;
  type: PushNotificationType;
  data?: Record<string, string | number | boolean | null>;
}

export interface BrowserPushSubscriptionInput {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
}

export interface BrowserPushNotificationPayload {
  id: string;
  type: string;
  title: string;
  body: string;
  url?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, string | number | boolean | null>;
}
