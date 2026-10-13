import {
  REGISTRATION_FIELDS,
  type RegistrationEvidence,
} from './registration.types';

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
          evidence: [] as RegistrationEvidence[],
        },
      ]),
    ),
  };
}
export function printedField(
  value: string,
  label = 'Make',
  unit: string | null = null,
  meaning?: RegistrationEvidence['meaning'],
) {
  return {
    value,
    status: 'extracted',
    evidence: [
      {
        imageIndex: 0,
        label,
        printedValue: value,
        unit,
        ...(meaning ? { meaning } : {}),
      },
    ],
  };
}
