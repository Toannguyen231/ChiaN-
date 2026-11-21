import type { ReceiptScanResultDto, ScanReceiptInput } from '@chiane/shared';
import { apiRequest } from './apiClient';

export interface ScanReceiptResponse {
  scan: ReceiptScanResultDto;
}

export const ocrApi = {
  scanReceipt(payload: ScanReceiptInput): Promise<ScanReceiptResponse> {
    return apiRequest<ScanReceiptResponse>('/api/v1/ocr/scan-receipt', {
      method: 'POST',
      body: JSON.stringify(payload),
      authenticated: true,
    });
  },
};
