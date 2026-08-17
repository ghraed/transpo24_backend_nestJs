const EURO_COUNTRY_CODES = new Set([
  'AD',
  'AT',
  'AX',
  'BE',
  'BL',
  'CY',
  'DE',
  'EE',
  'ES',
  'FI',
  'FR',
  'GF',
  'GP',
  'GR',
  'HR',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MC',
  'ME',
  'MF',
  'MQ',
  'MT',
  'NL',
  'PM',
  'PT',
  'RE',
  'SI',
  'SK',
  'SM',
  'VA',
  'XK',
]);

export function normalizeCountryCode(
  countryCode?: string | null,
): string | null {
  const normalized = countryCode?.trim().toUpperCase() ?? '';
  return normalized.length === 2 ? normalized : null;
}

export function currencyForCountryCode(countryCode?: string | null): string {
  const normalized = normalizeCountryCode(countryCode);

  if (!normalized) {
    return 'USD';
  }

  if (normalized === 'CH' || normalized === 'LI') {
    return 'CHF';
  }

  if (EURO_COUNTRY_CODES.has(normalized)) {
    return 'EUR';
  }

  if (normalized === 'AE') {
    return 'AED';
  }

  if (normalized === 'SA') {
    return 'SAR';
  }

  if (normalized === 'QA') {
    return 'QAR';
  }

  return 'USD';
}
