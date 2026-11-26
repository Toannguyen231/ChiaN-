import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { RECEIPT_UPLOAD_DIR } from '../routes/uploads.routes';
import { scanReceiptWithGemini } from '../services/ocr.service';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app';
import {
  CaptureOtpProvider,
  createAuthedUser,
  createTestDb,
  resetDb,
} from './test-helpers';

const testDb = createTestDb('ocr');

describe('ChiaNè AI OCR Receipt Scanning API', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let otpProvider: CaptureOtpProvider;

  beforeAll(async () => {
    prisma = await testDb.initPrisma();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    otpProvider = new CaptureOtpProvider();
    app = await buildApp({
      config: { ...testDb.config },
      prisma,
      otpProvider,
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await testDb.cleanupDb(prisma);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ocr/scan-receipt',
      payload: { imageBase64: 'fake-base64-image-data-string' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects invalid payload with 400 validation error', async () => {
    const an = await createAuthedUser(app, otpProvider, '0912345678', 'An');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ocr/scan-receipt',
      headers: an.authHeader,
      payload: { imageBase64: 'short' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('reports OCR unavailability and preserves compatibility with existing data URLs', async () => {
    const an = await createAuthedUser(app, otpProvider, '0912345678', 'An');
    const dummyImageBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ocr/scan-receipt',
      headers: an.authHeader,
      payload: { imageBase64: dummyImageBase64, mimeType: 'image/png' },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('OCR_UNAVAILABLE');

    // Create a group and save an expense with a large base64 receipt data URL (> 2000 chars)
    const groupRes = await app.inject({
      method: 'POST',
      url: '/api/v1/groups',
      headers: an.authHeader,
      payload: { name: 'Hội Ăn Tối', category: 'FOOD' },
    });
    expect(groupRes.statusCode).toBe(201);
    const group = groupRes.json().group;

    const largeDataUrl = `data:image/png;base64,${dummyImageBase64.repeat(30)}`;
    expect(largeDataUrl.length).toBeGreaterThan(2000);

    const expRes = await app.inject({
      method: 'POST',
      url: `/api/v1/groups/${group.id}/expenses`,
      headers: an.authHeader,
      payload: {
        title: 'Hóa đơn cũ',
        amountVnd: 550000,
        category: 'FOOD',
        splitMethod: 'EQUAL',
        paidByMemberId: group.myMemberId,
        receiptImageUrl: largeDataUrl,
        splits: [{ memberId: group.myMemberId }],
      },
    });
    expect(expRes.statusCode).toBe(201);
    expect(expRes.json().expense.receiptImageUrl).toBe(largeDataUrl);
  });
  it('returns OCR_UNAVAILABLE when every configured model is unavailable', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    try {
      await expect(scanReceiptWithGemini({ imageBase64: 'test', geminiApiKey: 'test' }))
        .rejects.toMatchObject({ statusCode: 503, code: 'OCR_UNAVAILABLE' });
    } finally {
      fetch.mockRestore();
    }
  });

  it('uploads and serves the original receipt bytes, validating auth, type and size', async () => {
    const an = await createAuthedUser(app, otpProvider, '0912345678', 'An');
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const upload = (imageBase64: string, mimeType: string, headers = {}) => app.inject({
      method: 'POST', url: '/api/v1/uploads/receipt', headers, payload: { imageBase64, mimeType },
    });
    expect((await upload(png, 'image/png')).statusCode).toBe(401);
    expect((await upload(png, 'image/jpeg', an.authHeader)).statusCode).toBe(400);
    expect((await upload(Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64'), 'image/png', an.authHeader)).statusCode).toBe(400);
    const result = await upload(png, 'image/png', an.authHeader);
    expect(result.statusCode).toBe(201);
    const url = result.json().receiptImageUrl as string;
    const wrappedPng = `${png.slice(0, 32)}\r\n${png.slice(32)}\n`;
    const wrappedResult = await upload(wrappedPng, 'image/png', an.authHeader);
    expect(wrappedResult.statusCode).toBe(201);
    const wrappedUrl = wrappedResult.json().receiptImageUrl as string;
    try {
      const image = await app.inject({ method: 'GET', url });
      expect(image.statusCode).toBe(200);
      expect(image.headers['content-type']).toContain('image/png');
      expect(image.headers['cache-control']).toContain('immutable');
      expect(image.rawPayload).toEqual(Buffer.from(png, 'base64'));

      const wrappedImage = await app.inject({ method: 'GET', url: wrappedUrl });
      expect(wrappedImage.statusCode).toBe(200);
      expect(wrappedImage.rawPayload).toEqual(Buffer.from(png, 'base64'));
    } finally {
      await unlink(path.join(RECEIPT_UPLOAD_DIR, path.basename(url))).catch(() => {});
      await unlink(path.join(RECEIPT_UPLOAD_DIR, path.basename(wrappedUrl))).catch(() => {});
    }
  });
});
