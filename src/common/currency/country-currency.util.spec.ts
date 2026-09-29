import {
  currencyForCountryCode,
  normalizeCountryCode,
} from './country-currency.util';

describe('country currency', () => {
  it.each([
    [' ch ', 'CH', 'CHF'],
    ['li', 'LI', 'CHF'],
    ['fr', 'FR', 'EUR'],
    ['AE', 'AE', 'AED'],
    ['SA', 'SA', 'SAR'],
    ['qa', 'QA', 'QAR'],
    ['US', 'US', 'USD'],
  ])('normalizes %s and resolves currency', (input, country, currency) => {
    expect(normalizeCountryCode(input)).toBe(country);
    expect(currencyForCountryCode(input)).toBe(currency);
  });

  it.each([undefined, null, '', ' ', 'CHE'])(
    'defaults invalid country %s to USD',
    (input) => {
      expect(normalizeCountryCode(input)).toBeNull();
      expect(currencyForCountryCode(input)).toBe('USD');
    },
  );
});
