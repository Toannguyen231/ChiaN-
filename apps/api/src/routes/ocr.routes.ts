import { scanReceiptSchema, type ReceiptScanResultDto } from '@chiane/shared';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { scanReceiptWithGemini } from '../services/ocr.service';

export interface OcrRoutesDeps {
  requireAuthOrGuest: preHandlerHookHandler;
  geminiApiKey?: string;
}

export async function registerOcrRoutes(
  app: FastifyInstance,
  deps: OcrRoutesDeps
): Promise<void> {
  const { requireAuthOrGuest, geminiApiKey } = deps;

  app.post(
    '/api/v1/ocr/scan-receipt',
    { preHandler: requireAuthOrGuest },
    async (request, reply) => {
      const input = scanReceiptSchema.parse(request.body);

      const result: ReceiptScanResultDto = await scanReceiptWithGemini({
        imageBase64: input.imageBase64,
        mimeType: input.mimeType,
        geminiApiKey,
      });

      return reply.status(200).send(result);
    }
  );
}
