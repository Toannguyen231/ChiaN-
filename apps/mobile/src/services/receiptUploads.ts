import { apiRequest } from './apiClient';

export type SupportedReceiptMime = 'image/jpeg' | 'image/png' | 'image/webp';

export function inferReceiptMimeType(
  base64Data: string,
  fallbackMime?: string | null
): SupportedReceiptMime {
  const clean = base64Data.replace(/\s+/g, '');
  if (clean.startsWith('/9j/')) return 'image/jpeg';
  if (clean.startsWith('iVBORw0KGgo')) return 'image/png';
  if (clean.startsWith('UklGR')) return 'image/webp';
  const lower = (fallbackMime ?? '').trim().toLowerCase();
  if (lower === 'image/png') return 'image/png';
  if (lower === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

export async function uploadReceiptIfNeeded(url?: string | null) {
  if (!url?.startsWith('data:image/')) return url;
  const comma = url.indexOf(',');
  if (comma < 0) throw new Error('Dữ liệu ảnh hóa đơn không hợp lệ.');
  const headerMime = /^data:(image\/[\w.+-]+);base64$/i.exec(url.slice(0, comma))?.[1];
  const cleanBase64 = url.slice(comma + 1).replace(/\s+/g, '');
  if (!cleanBase64) throw new Error('Dữ liệu ảnh hóa đơn không hợp lệ.');
  const mimeType = inferReceiptMimeType(cleanBase64, headerMime);
  const { receiptImageUrl } = await apiRequest<{ receiptImageUrl: string }>(
    '/api/v1/uploads/receipt',
    {
      method: 'POST',
      authenticated: true,
      body: { imageBase64: cleanBase64, mimeType },
    }
  );
  return receiptImageUrl;
}
