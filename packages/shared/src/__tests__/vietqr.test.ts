import { describe, expect, it } from 'vitest';
import { buildVietQrPayload, computeCrc16Ccitt } from '../index';

describe('VietQR payload generation', () => {
  it('returns null when recipient bank info is incomplete', () => {
    expect(buildVietQrPayload({ bankBin: null, accountNumber: null })).toBeNull();
    expect(buildVietQrPayload({ bankBin: '970422', accountNumber: '' })).toBeNull();
    expect(buildVietQrPayload({ bankBin: '123', accountNumber: '0123456789' })).toBeNull();
  });

  it('builds valid EMVCo NAPAS 247 VietQR string with CRC16 checksum', () => {
    const payload = buildVietQrPayload({
      bankBin: '970422',
      accountNumber: '0123456789',
      amountVnd: 400_000,
      memo: 'An trả tiền Đà Lạt!',
    });

    expect(payload).not.toBeNull();
    expect(payload!.startsWith('000201010212')).toBe(true);
    expect(payload).toContain('970422');
    expect(payload).toContain('0123456789');
    expect(payload).toContain('5303704');
    expect(payload).toContain('5406400000');
    expect(payload).toContain('An tra tien Da Lat');

    const bodyWithoutCrc = payload!.slice(0, -4);
    const crc = payload!.slice(-4);
    expect(computeCrc16Ccitt(bodyWithoutCrc)).toBe(crc);
  });
});
