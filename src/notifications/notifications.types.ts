import type { PushApp } from '@prisma/client';

export type NotificationRecipientApp = PushApp;

export type PushNotificationType =
  | 'NEW_TRANSPORT_REQUEST'
  | 'NEW_DRIVER_OFFER'
  | 'DRIVER_SELECTED'
  | string;

export interface SendPushNotificationInput {
  userIds: string[];
  app: NotificationRecipientApp;
  title: string;
  body: string;
  type: PushNotificationType;
  data?: Record<string, string | number | boolean | null>;
}
