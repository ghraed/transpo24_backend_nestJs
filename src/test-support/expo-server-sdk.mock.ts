export class Expo {
  static isExpoPushToken(token: string): boolean {
    return token.startsWith('ExponentPushToken[');
  }

  chunkPushNotifications<T>(messages: T[]): T[][] {
    return [messages];
  }

  sendPushNotificationsAsync(): Promise<unknown[]> {
    return Promise.resolve([]);
  }

  chunkPushNotificationReceiptIds(receiptIds: string[]): string[][] {
    return [receiptIds];
  }

  getPushNotificationReceiptsAsync(): Promise<Record<string, unknown>> {
    return Promise.resolve({});
  }
}
