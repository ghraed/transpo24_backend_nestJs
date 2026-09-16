import { PushApp, PushPlatform, UserRole } from '@prisma/client';
import { PushTokensService } from '../push-tokens/push-tokens.service';
import { NotificationsService } from './notifications.service';
import { pushScope } from './push-environment';

const originalEnvironment = process.env.PUSH_ENVIRONMENT;
afterEach(() => {
  if (originalEnvironment === undefined) delete process.env.PUSH_ENVIRONMENT;
  else process.env.PUSH_ENVIRONMENT = originalEnvironment;
});

it.each([undefined, '', 'production', 'invalid'])(
  'fails closed for configuration %s',
  (value) => {
    if (value === undefined) delete process.env.PUSH_ENVIRONMENT;
    else process.env.PUSH_ENVIRONMENT = value;
    expect(() => pushScope(PushApp.CUSTOMER)).toThrow('PUSH_ENVIRONMENT');
  },
);

it.each(['DEVELOPMENT', 'PRODUCTION'])(
  'isolates registration and delivery in %s',
  async (environment) => {
    process.env.PUSH_ENVIRONMENT = environment;
    for (const app of [PushApp.CUSTOMER, PushApp.DRIVER]) {
      const own = pushScope(app);
      const opposite = {
        environment:
          environment === 'DEVELOPMENT' ? 'PRODUCTION' : 'DEVELOPMENT',
        applicationId: own.applicationId.endsWith('.dev')
          ? own.applicationId.slice(0, -4)
          : own.applicationId + '.dev',
      };
      const input = {
        userId: 'user',
        role: app === PushApp.CUSTOMER ? UserRole.CUSTOMER : UserRole.DRIVER,
        hasDriverProfile: true,
        token: 'ExponentPushToken[own]',
        app,
        platform: PushPlatform.android,
        applicationId: opposite.applicationId,
      };
      const upsert = jest.fn();
      const findUnique = jest.fn().mockResolvedValue(opposite);
      const registration = new PushTokensService({
        pushToken: { upsert, findUnique },
      } as never);
      await expect(registration.registerToken(input)).rejects.toThrow(
        'cannot register',
      );
      expect(findUnique).not.toHaveBeenCalled();
      await expect(
        registration.registerToken({
          ...input,
          applicationId: own.applicationId,
        }),
      ).rejects.toThrow('belongs to another');
      expect(upsert).not.toHaveBeenCalled();
      findUnique.mockResolvedValue(null);
      await registration.registerToken({
        ...input,
        applicationId: own.applicationId,
      });
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining(own) }),
      );

      const rows = [
        { id: 'own', token: 'ExponentPushToken[own]', ...own },
        { id: 'opposite', token: 'ExponentPushToken[opposite]', ...opposite },
        {
          id: 'legacy',
          token: 'ExponentPushToken[legacy]',
          environment: null,
          applicationId: null,
        },
      ];
      const matches = (
        row: (typeof rows)[number],
        where: Record<string, unknown>,
      ) =>
        row.environment === where.environment &&
        row.applicationId === where.applicationId;
      const findMany = jest.fn(
        ({ where }: { where: Record<string, unknown> }) =>
          Promise.resolve(rows.filter((row) => matches(row, where))),
      );
      const findFirst = jest.fn(
        ({ where }: { where: Record<string, unknown> }) =>
          Promise.resolve(
            rows.find(
              (row) => row.token === where.token && matches(row, where),
            ) ?? null,
          ),
      );
      const notifications = new NotificationsService(
        {
          pushToken: { findMany, findFirst },
          customerNotification: {
            createMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
        } as never,
        {} as never,
      );
      const send = jest.fn().mockResolvedValue([]);
      Object.assign(notifications, {
        expo: {
          chunkPushNotifications: (messages: unknown[]) => [messages],
          sendPushNotificationsAsync: send,
        },
      });
      await notifications.sendToUsers({
        userIds: ['user'],
        app,
        title: 'Test',
        body: 'Test',
        type: 'TEST_NOTIFICATION',
      });
      expect(send).toHaveBeenCalledWith([
        expect.objectContaining({ to: rows[0].token }),
      ]);
      send.mockClear();
      for (const blocked of rows.slice(1)) {
        await expect(
          notifications.sendTestToDevice('user', app, blocked.token),
        ).rejects.toThrow('Register notifications');
      }
      expect(send).not.toHaveBeenCalled();
    }
  },
);
