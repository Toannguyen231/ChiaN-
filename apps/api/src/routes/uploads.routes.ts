import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../config/env';
import { createReceiptStorage } from '../services/receipt-storage.service';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { z } from 'zod';
import { AppError } from '../utils/errors';

const maxSize = 5 * 1024 * 1024;
const maxEncodedLength = 4 * Math.ceil(maxSize / 3) + 262_144;
const schema = z.object({
  imageBase64: z.string().min(1).max(maxEncodedLength),
  mimeType: z.enum(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']),
});
const mimeTypes = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const;

function extension(bytes: Buffer) {
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return 'jpg';
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'png';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export function registerReceiptUploads(app: FastifyInstance, auth: preHandlerHookHandler, config: AppConfig) {
  const storage = createReceiptStorage(config);
  app.post('/api/v1/uploads/receipt', { preHandler: auth }, async (request, reply) => {
    const { imageBase64, mimeType } = schema.parse(request.body);
    const cleanBase64 = imageBase64
      .replace(/^data:image\/[\w.+-]+;base64,/i, '')
      .replace(/\s+/g, '');
    const normalizedMime = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;

    if (
      cleanBase64.length === 0 ||
      cleanBase64.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(cleanBase64)
    ) {
      throw new AppError(400, 'INVALID_RECEIPT_IMAGE', 'Chọn ảnh JPEG, PNG hoặc WebP tối đa 5 MB nhé.');
    }

    const bytes = Buffer.from(cleanBase64, 'base64');
    const ext = extension(bytes);
    if (
      !ext ||
      mimeTypes[ext] !== normalizedMime ||
      bytes.length === 0 ||
      bytes.length > maxSize ||
      bytes.toString('base64') !== cleanBase64
    ) {
      throw new AppError(400, 'INVALID_RECEIPT_IMAGE', 'Chọn ảnh JPEG, PNG hoặc WebP tối đa 5 MB nhé.');
    }
    const filename = `${randomUUID()}.${ext}`;
    const receiptImageUrl = await storage.put(filename, bytes, normalizedMime);
    return reply.status(201).send({ receiptImageUrl });
  });
  app.get('/api/v1/uploads/receipts/:filename', async (request, reply) => {
    const { filename } = request.params as { filename: string };
    if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}\.(jpg|png|webp)$/.test(filename)) {
      throw new AppError(404, 'RECEIPT_NOT_FOUND', 'Không tìm thấy ảnh hóa đơn.');
    }
    const ext = filename.split('.').pop() as keyof typeof mimeTypes;
    const image = await storage.get(filename);
    return reply.type(mimeTypes[ext]).header('Cache-Control', 'private, max-age=31536000, immutable')
      .header('Cross-Origin-Resource-Policy', 'cross-origin').send(image);
  });
}
