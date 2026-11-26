import { createHash, createHmac } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import type { AppConfig } from '../config/env';
import { AppError } from '../utils/errors';

export const RECEIPT_UPLOAD_DIR = path.resolve(__dirname, '../../uploads/receipts');
const receiptRoute = '/api/v1/uploads/receipts/';

function hmac(key: string | Buffer, message: string) {
  return createHmac('sha256', key).update(message).digest();
}

async function readLocal(filename: string) {
  try {
    return await readFile(path.join(RECEIPT_UPLOAD_DIR, filename));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    throw new AppError(404, 'RECEIPT_NOT_FOUND', 'Không tìm thấy ảnh hóa đơn.');
  }
}

// Filenames are server-generated UUIDs, validated by the route before reads.
export function createReceiptStorage(config: AppConfig) {
  const { S3_ENDPOINT: endpoint, S3_BUCKET: bucket, S3_ACCESS_KEY_ID: accessKey,
    S3_SECRET_ACCESS_KEY: secret, S3_PUBLIC_BASE_URL: publicBase, S3_REGION: region = 'us-east-1' } = config;

  if (!endpoint || !bucket || !accessKey || !secret) {
    return {
      async put(filename: string, bytes: Buffer, _mime: string) {
        await mkdir(RECEIPT_UPLOAD_DIR, { recursive: true });
        await writeFile(path.join(RECEIPT_UPLOAD_DIR, filename), bytes, { flag: 'wx' });
        return receiptRoute + filename;
      },
      get: readLocal,
    };
  }

  async function request(method: 'PUT' | 'GET', filename: string, bytes?: Buffer, mime?: string) {
    const url = new URL(`${endpoint!.replace(/\/+$/, '')}/${bucket}/receipts/${filename}`);
    const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = timestamp.slice(0, 8);
    const digest = createHash('sha256').update(bytes ?? '').digest('hex');
    const headers: Record<string, string> = { host: url.host, 'x-amz-content-sha256': digest, 'x-amz-date': timestamp };
    if (mime) headers['content-type'] = mime;
    const names = Object.keys(headers).sort();
    const canonicalHeaders = names.map(name => name + ':' + headers[name] + '\n').join('');
    const signedHeaders = names.join(';');
    const canonical = [method, url.pathname, '', canonicalHeaders, signedHeaders, digest].join('\n');
    const scope = `${date}/${region}/s3/aws4_request`;
    const toSign = ['AWS4-HMAC-SHA256', timestamp, scope, createHash('sha256').update(canonical).digest('hex')].join('\n');
    const signingKey = hmac(hmac(hmac(hmac('AWS4' + secret, date), region), 's3'), 'aws4_request');
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${hmac(signingKey, toSign).toString('hex')}`;
    const response = await fetch(url, { method, headers, body: bytes && new Uint8Array(bytes),
      redirect: 'error', signal: AbortSignal.timeout(30_000) });
    if (!response.ok && !(method === 'GET' && response.status === 404)) {
      await response.body?.cancel();
      throw new AppError(502, 'RECEIPT_STORAGE_ERROR', 'Kho ảnh tạm thời chưa khả dụng.');
    }
    return response;
  }

  return {
    async put(filename: string, bytes: Buffer, mime: string) {
      const response = await request('PUT', filename, bytes, mime);
      await response.body?.cancel();
      return publicBase ? `${publicBase.replace(/\/+$/, '')}/receipts/${filename}` : receiptRoute + filename;
    },
    async get(filename: string) {
      const response = await request('GET', filename);
      if (response.status === 404) {
        await response.body?.cancel();
        return readLocal(filename);
      }
      if (!response.body) throw new AppError(502, 'RECEIPT_STORAGE_ERROR', 'Kho ảnh trả về phản hồi trống.');
      return Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
    },
  };
}
