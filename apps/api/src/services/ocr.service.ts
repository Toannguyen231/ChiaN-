import { AppError } from '../utils/errors';
import type { ExpenseCategory, ReceiptItemDto, ReceiptScanResultDto } from '@chiane/shared';

export interface ScanReceiptParams {
  imageBase64: string;
  mimeType?: string;
  geminiApiKey?: string;
}

const VALID_CATEGORIES = new Set<ExpenseCategory>([
  'FOOD',
  'STAY',
  'TRANSPORT',
  'COFFEE',
  'OTHER',
]);

const GEMINI_VISION_MODELS = [
  'gemini-2.5-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest',
] as const;

export async function scanReceiptWithGemini({
  imageBase64,
  mimeType = 'image/jpeg',
  geminiApiKey,
}: ScanReceiptParams): Promise<ReceiptScanResultDto> {
  const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '').trim();

  // 1. If Gemini API Key is configured, use live Google Gemini Flash Vision with multi-model resilience
  if (geminiApiKey?.trim()) {
    const promptText = `Bạn là chuyên gia phân tích hóa đơn và biên lai tài chính Việt Nam.
Hãy đọc ảnh hóa đơn được đính kèm và trích xuất thông tin dưới dạng JSON thuần túy (không bọc trong markdown block, không chú thích thêm):
{
  "totalVnd": 450000,
  "detectedMerchant": "Tên quán hoặc nhà hàng nếu đọc được",
  "detectedCategory": "FOOD",
  "date": "YYYY-MM-DD nếu đọc được",
  "items": [
    { "name": "Tên món hoặc hàng hóa", "priceVnd": 350000, "quantity": 1 }
  ]
}
Yêu cầu bắt buộc:
1. totalVnd là số nguyên VND (ví dụ 450000, tuyệt đối không có dấu phẩy hay chấm).
2. detectedCategory phải thuộc 1 trong 5 loại: "FOOD", "STAY", "TRANSPORT", "COFFEE", "OTHER".
3. Các món trong items nếu đọc được tên và giá thì liệt kê, priceVnd là giá tiền từng món tính theo số lượng (hoặc đơn giá * số lượng).
4. Nếu tổng tiền các món khác với totalVnd do thuế hoặc giảm giá thì ghi nhận đúng theo hóa đơn.`;

    const requestBody = JSON.stringify({
      contents: [
        {
          parts: [
            { text: promptText },
            {
              inlineData: {
                mimeType: mimeType || 'image/jpeg',
                data: cleanBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    });

    for (const modelName of GEMINI_VISION_MODELS) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(
            geminiApiKey.trim()
          )}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(15_000),
            body: requestBody,
          }
        );

        if (!response.ok) {
          continue;
        }

        const data = (await response.json()) as {
          candidates?: Array<{
            content?: {
              parts?: Array<{ text?: string }>;
            };
          }>;
        };

        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) {
          continue;
        }

        const parsed = JSON.parse(rawText) as {
          totalVnd?: number;
          detectedMerchant?: string;
          detectedCategory?: ExpenseCategory;
          date?: string;
          items?: Array<{ name?: string; priceVnd?: number; quantity?: number }>;
        };

        const items: ReceiptItemDto[] = Array.isArray(parsed.items)
          ? parsed.items
              .filter((item) => item.name && typeof item.priceVnd === 'number')
              .map((item) => ({
                name: String(item.name).trim(),
                priceVnd: Math.max(0, Math.round(Number(item.priceVnd) || 0)),
                quantity: typeof item.quantity === 'number' ? item.quantity : 1,
              }))
          : [];

        const calculatedSum = items.reduce((sum, it) => sum + it.priceVnd, 0);
        const totalVnd =
          typeof parsed.totalVnd === 'number' && parsed.totalVnd > 0
            ? Math.round(parsed.totalVnd)
            : calculatedSum;

        const detectedCategory: ExpenseCategory =
          parsed.detectedCategory && VALID_CATEGORIES.has(parsed.detectedCategory)
            ? parsed.detectedCategory
            : 'FOOD';

        return {
          totalVnd,
          detectedMerchant: parsed.detectedMerchant?.trim() || null,
          detectedCategory,
          date: parsed.date || null,
          items,
          notice: `✨ Đã phân tích hóa đơn trực tiếp bằng Google Gemini AI (${modelName})`,
        };
      } catch {
        // Try next available Gemini Vision model in cascade
      }
    }
  }

  throw new AppError(503, 'OCR_UNAVAILABLE', 'Quét AI tạm thời chưa khả dụng. Bạn nhập nhanh số tiền trên hóa đơn nhé.');
}
