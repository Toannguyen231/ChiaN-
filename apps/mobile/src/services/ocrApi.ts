import type { ReceiptScanResultDto, ScanReceiptInput } from '@chiane/shared';
import { ApiClientError, apiRequest } from './apiClient';

export const ocrApi = {
  async scanReceipt(payload: ScanReceiptInput): Promise<ReceiptScanResultDto> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55_000);
    try {
      return await apiRequest<ReceiptScanResultDto>('/api/v1/ocr/scan-receipt', {
        method: 'POST',
        body: payload,
        authenticated: true,
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        throw new ApiClientError(408, 'OCR_TIMEOUT', 'Quét ảnh mất nhiều thời gian. Ảnh đã được giữ lại, bạn có thể nhập tay.');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  },
};
