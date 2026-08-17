import { parseCorsOrigins } from './http';

describe('HTTP configuration', () => {
  it('uses reflected origins only when no allowlist is configured', () => {
    expect(parseCorsOrigins(undefined)).toBe(true);
    expect(parseCorsOrigins('  ')).toBe(true);
  });

  it('normalizes a comma-separated CORS allowlist', () => {
    expect(
      parseCorsOrigins(' https://app.example.com,https://admin.example.com '),
    ).toEqual(['https://app.example.com', 'https://admin.example.com']);
  });
});
