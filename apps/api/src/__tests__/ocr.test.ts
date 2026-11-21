import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

  it('successfully analyzes receipt and returns structured bill items and total', async () => {
    const an = await createAuthedUser(app, otpProvider, '0912345678', 'An');
    const dummyImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ocr/scan-receipt',
      headers: an.authHeader,
      payload: { imageBase64: dummyImageBase64, mimeType: 'image/png' },
    });

    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(typeof data.totalVnd).toBe('number');
    expect(data.totalVnd).toBeGreaterThan(0);
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items.length).toBeGreaterThan(0);
    expect(typeof data.items[0].priceVnd).toBe('number');
  });
});
