export const REGISTRATION_FIELDS = [
  'vin',
  'swissRegistrationNumber',
  'brand',
  'model',
  'manufactureYear',
  'emptyWeightKg',
  'bodyType',
  'transmission',
] as const;
export type RegistrationFieldName = (typeof REGISTRATION_FIELDS)[number];
export type FieldStatus = 'extracted' | 'missing' | 'ambiguous' | 'invalid';
export type RegistrationEvidence = {
  imageIndex: number;
  label: string;
  printedValue: string;
  unit: string | null;
};
export type RegistrationField = {
  value: string | number | null;
  status: FieldStatus;
  evidence: RegistrationEvidence[];
};
export type RegistrationExtraction = {
  status: 'extracted' | 'partial' | 'wrong_document' | 'unreadable';
  fields: Record<RegistrationFieldName, RegistrationField>;
  missingFields: RegistrationFieldName[];
  warnings: { code: string; field?: RegistrationFieldName }[];
};
