import type { RegistrationExtraction } from './registration.types';

export type RegistrationJobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired';

export type RegistrationJobView = {
  jobId: string;
  status: RegistrationJobStatus;
  expiresAt: string;
  result?: RegistrationExtraction;
  error?: { code: string };
};

export type RegistrationJobRecord = {
  jobId: string;
  ownerId: string;
  status: RegistrationJobStatus | 'uploading';
  expiresAt: number;
  files?: string[];
  result?: RegistrationExtraction;
  error?: { code: string };
};

export const isTerminalScan = (status: RegistrationJobRecord['status']) =>
  !['uploading', 'queued', 'processing'].includes(status);
