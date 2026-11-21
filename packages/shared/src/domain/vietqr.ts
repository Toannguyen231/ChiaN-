export interface VnBankInfo {
  bin: string;
  shortName: string;
  name: string;
}

export const VN_BANKS: readonly VnBankInfo[] = [
  { bin: '970436', shortName: 'Vietcombank', name: 'Ngân hàng TMCP Ngoại thương Việt Nam' },
  { bin: '970422', shortName: 'MB Bank', name: 'Ngân hàng TMCP Quân đội' },
  { bin: '970407', shortName: 'Techcombank', name: 'Ngân hàng TMCP Kỹ thương Việt Nam' },
  { bin: '970416', shortName: 'ACB', name: 'Ngân hàng TMCP Á Châu' },
  { bin: '970418', shortName: 'BIDV', name: 'Ngân hàng TMCP Đầu tư và Phát triển VN' },
  { bin: '970415', shortName: 'VietinBank', name: 'Ngân hàng TMCP Công thương Việt Nam' },
  { bin: '970423', shortName: 'TPBank', name: 'Ngân hàng TMCP Tiên Phong' },
  { bin: '970432', shortName: 'VPBank', name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng' },
  { bin: '970403', shortName: 'Sacombank', name: 'Ngân hàng TMCP Sài Gòn Thương Tín' },
  { bin: '970441', shortName: 'VIB', name: 'Ngân hàng TMCP Quốc tế Việt Nam' },
  { bin: '970405', shortName: 'Agribank', name: 'Ngân hàng Nông nghiệp & PTNT Việt Nam' },
  { bin: '970448', shortName: 'OCB', name: 'Ngân hàng TMCP Phương Đông' },
  { bin: '970426', shortName: 'MSB', name: 'Ngân hàng TMCP Hàng Hải Việt Nam' },
  { bin: '970437', shortName: 'HDBank', name: 'Ngân hàng TMCP Phát triển TP.HCM' },
  { bin: '970409', shortName: 'BacABank', name: 'Ngân hàng TMCP Bắc Á' },
  { bin: '970431', shortName: 'Eximbank', name: 'Ngân hàng TMCP Xuất Nhập Khẩu VN' },
] as const;

export function maskBankAccount(accountNumber?: string | null): string | null {
  const clean = accountNumber?.trim() ?? '';
  if (!clean) {
    return null;
  }
  if (clean.length <= 4) {
    return `•••• ${clean}`;
  }
  return `•••• ${clean.slice(-4)}`;
}

export interface VietQrInput {
  bankBin?: string | null;
  accountNumber?: string | null;
  amountVnd?: number;
  memo?: string;
}

function tlv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

function sanitizeMemo(memo: string): string {
  return memo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);
}

/**
 * Computes EMVCo CRC-16/CCITT-FALSE checksum (polynomial 0x1021, initial value 0xFFFF).
 */
export function computeCrc16Ccitt(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Builds an EMVCo / NAPAS 247 VietQR payload string ONLY when valid recipient
 * bank BIN (6 digits) and account number are provided. Returns null otherwise so
 * callers never render a deceptive or fabricated payment QR payload.
 */
export function buildVietQrPayload(input: VietQrInput): string | null {
  const bankBin = input.bankBin?.trim() ?? '';
  const accountNumber = input.accountNumber?.trim() ?? '';

  if (!/^\d{6}$/.test(bankBin) || !/^[A-Za-z0-9]{4,24}$/.test(accountNumber)) {
    return null;
  }

  const beneficiaryInfo = `${tlv('00', bankBin)}${tlv('01', accountNumber)}`;
  const consumerAccountInfo = `${tlv('00', 'A000000727')}${tlv('01', beneficiaryInfo)}${tlv('02', 'QRIBFTTA')}`;

  const parts = [
    tlv('00', '01'),
    tlv('01', input.amountVnd && input.amountVnd > 0 ? '12' : '11'),
    tlv('38', consumerAccountInfo),
    tlv('53', '704'), // VND ISO 4217 numeric code
  ];

  if (input.amountVnd && Number.isInteger(input.amountVnd) && input.amountVnd > 0) {
    parts.push(tlv('54', input.amountVnd.toString()));
  }

  parts.push(tlv('58', 'VN'));

  if (input.memo) {
    const cleanMemo = sanitizeMemo(input.memo);
    if (cleanMemo) {
      parts.push(tlv('62', tlv('08', cleanMemo)));
    }
  }

  const unsignedPayload = `${parts.join('')}6304`;
  const crc = computeCrc16Ccitt(unsignedPayload);
  return `${unsignedPayload}${crc}`;
}
