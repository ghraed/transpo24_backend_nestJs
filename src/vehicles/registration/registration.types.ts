export const MAX_REGISTRATION_PAGES = 6;

export const REGISTRATION_FIELDS = [
  'vin',
  'swissRegistrationNumber',
  'brand',
  'model',
  'manufactureYear',
  'emptyWeightKg',
] as const;
export type RegistrationFieldName = (typeof REGISTRATION_FIELDS)[number];
export type FieldStatus = 'extracted' | 'missing' | 'ambiguous' | 'invalid';
export const REGISTRATION_EVIDENCE_MEANINGS = [
  'vin',
  'swiss_registration_number',
  'make',
  'model',
  'make_model',
  'empty_weight',
  'manufacture_year',
  'first_registration_date',
  'engine_displacement',
  'gross_weight',
  'payload',
  'document_date',
  'other',
] as const;
export type RegistrationEvidence = {
  imageIndex: number;
  label: string;
  printedValue: string;
  unit: string | null;
  meaning?: (typeof REGISTRATION_EVIDENCE_MEANINGS)[number];
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
