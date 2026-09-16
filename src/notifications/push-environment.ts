import { PushApp } from '@prisma/client';

// Never infer this from NODE_ENV: local release builds also run in production mode.
export function pushScope(app: PushApp): {
  environment: string;
  applicationId: string;
} {
  const environment = process.env.PUSH_ENVIRONMENT;
  if (environment !== 'DEVELOPMENT' && environment !== 'PRODUCTION') {
    throw new Error(
      'Set PUSH_ENVIRONMENT to DEVELOPMENT or PRODUCTION before using mobile push.',
    );
  }
  const packageName =
    app === PushApp.CUSTOMER ? 'com.transpo24.app' : 'com.transpo24.driver';
  return {
    environment,
    applicationId: packageName + (environment === 'DEVELOPMENT' ? '.dev' : ''),
  };
}
