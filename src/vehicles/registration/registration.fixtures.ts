import { REGISTRATION_FIELDS } from './registration.types';

// Synthetic structured output only; no real documents or personal information.
export function syntheticExtraction() {
  return {
    status: 'partial',
    fields: Object.fromEntries(
      REGISTRATION_FIELDS.map((name) => [
        name,
        {
          value: null as string | null,
          status: 'missing',
          evidence: [] as {
            imageIndex: number;
            label: string;
            printedValue: string;
            unit: string | null;
          }[],
        },
      ]),
    ),
  };
}
export function printedField(
  value: string,
  label = 'Make',
  unit: string | null = null,
) {
  return {
    value,
    status: 'extracted',
    evidence: [{ imageIndex: 0, label, printedValue: value, unit }],
  };
}
