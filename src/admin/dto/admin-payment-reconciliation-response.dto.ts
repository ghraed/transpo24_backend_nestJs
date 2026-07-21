export type AdminPaymentReconciliationStream =
  | 'all'
  | 'wallet'
  | 'captures'
  | 'refunds'
  | 'transfers';

export type AdminPaymentReconciliationStatus =
  | 'all'
  | 'matched'
  | 'mismatch'
  | 'missing'
  | 'failed';

export interface AdminPaymentReconciliationSummaryDto {
  walletCount: number;
  captureCount: number;
  refundCount: number;
  transferCount: number;
  mismatchCount: number;
  failedJobCount: number;
}

export interface AdminPaymentReconciliationJobRunDto {
  id: string;
  stream: Exclude<AdminPaymentReconciliationStream, 'all'>;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'RUNNING';
  startedAt: string | null;
  finishedAt: string | null;
  scannedCount: number;
  matchedCount: number;
  mismatchCount: number;
  missingCount: number;
  errorMessage: string | null;
}

export interface AdminPaymentReconciliationPartyDto {
  id: string | null;
  name: string | null;
  email: string | null;
}

export interface AdminPaymentReconciliationItemDto {
  id: string;
  stream: Exclude<AdminPaymentReconciliationStream, 'all'>;
  status: Exclude<AdminPaymentReconciliationStatus, 'all'>;
  currency: string;
  expectedAmount: number | null;
  actualAmount: number | null;
  deltaAmount: number | null;
  reference: string | null;
  externalReference: string | null;
  tripId: string | null;
  walletTopUpId: string | null;
  transferId: string | null;
  refundId: string | null;
  captureId: string | null;
  customer: AdminPaymentReconciliationPartyDto | null;
  driver: AdminPaymentReconciliationPartyDto | null;
  reason: string | null;
  jobRunId: string | null;
  detectedAt: string | null;
  resolvedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AdminPaymentReconciliationListResponseDto {
  items: AdminPaymentReconciliationItemDto[];
  total: number;
  summary: AdminPaymentReconciliationSummaryDto;
  latestRuns: AdminPaymentReconciliationJobRunDto[];
}

export interface AdminPaymentReconciliationRunResponseDto {
  runs: AdminPaymentReconciliationJobRunDto[];
}
