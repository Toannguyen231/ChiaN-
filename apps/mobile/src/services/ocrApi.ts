import type { ReceiptScanResultDto, ScanReceiptInput } from '@chiane/shared';
import { apiRequest } from './apiClient';

export const ocrApi = {
  scanReceipt(payload: ScanReceiptInput): Promise<ReceiptScanResultDto> {
    return apiRequest<ReceiptScanResultDto>('/api/v1/ocr/scan-receipt', {
      method: 'POST',
      body: JSON.stringify(payload),
      authenticated: true,
    });
  },
};
