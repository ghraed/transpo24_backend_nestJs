import { hashPassword, verifyPassword } from './password.util';

describe('password hashing', () => {
  it('verifies the right password, rejects a wrong one, and salts each hash', () => {
    const first = hashPassword('correct horse battery staple');
    const second = hashPassword('correct horse battery staple');
    expect(first).not.toBe(second);
    expect(verifyPassword('correct horse battery staple', first)).toBe(true);
    expect(verifyPassword('wrong password', first)).toBe(false);
  });

  it.each(['', 'salt', ':hash', 'salt:', 'salt:abcd'])(
    'rejects malformed stored hash %s',
    (stored) => {
      expect(verifyPassword('password', stored)).toBe(false);
    },
  );
});
