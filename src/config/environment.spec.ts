import { validateEnvironment } from './environment';

describe('validateEnvironment', () => {
  const configured = {
    TWILIO_ACCOUNT_SID: 'AC_test',
    TWILIO_AUTH_TOKEN: 'secret',
    TWILIO_VERIFY_SERVICE_SID: 'VA_test',
  };

  it('accepts the required Twilio configuration', () => {
    expect(validateEnvironment(configured)).toBe(configured);
  });

  it('reports missing Twilio configuration without exposing values', () => {
    expect(() => validateEnvironment({})).toThrow(
      'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID',
    );
  });

  it('does not require a configurable Verify channel', () => {
    expect(validateEnvironment(configured)).toBe(configured);
  });
});
