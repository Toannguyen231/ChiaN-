export interface VnBankInfo {
  bin: string;
  shortName: string;
  name: string;
  aliases: readonly string[];
}

export const VN_BANKS: readonly VnBankInfo[] = [
  { bin: '970436', shortName: 'Vietcombank', name: 'Ngân hàng TMCP Ngoại thương Việt Nam', aliases: ['VCB', 'Ngoai thuong'] },
  { bin: '970422', shortName: 'MB Bank', name: 'Ngân hàng TMCP Quân đội', aliases: ['MB', 'MBB', 'MBBank', 'Quan doi'] },
  { bin: '970407', shortName: 'Techcombank', name: 'Ngân hàng TMCP Kỹ thương Việt Nam', aliases: ['TCB', 'Techcom', 'Ky thuong'] },
  { bin: '970416', shortName: 'ACB', name: 'Ngân hàng TMCP Á Châu', aliases: ['ACB', 'A Chau'] },
  { bin: '970418', shortName: 'BIDV', name: 'Ngân hàng TMCP Đầu tư và Phát triển VN', aliases: ['BIDV', 'BID', 'Dau tu'] },
  { bin: '970415', shortName: 'VietinBank', name: 'Ngân hàng TMCP Công thương Việt Nam', aliases: ['VTB', 'CTG', 'Vietin', 'Cong thuong'] },
  { bin: '970423', shortName: 'TPBank', name: 'Ngân hàng TMCP Tiên Phong', aliases: ['TPB', 'Tien Phong'] },
  { bin: '970432', shortName: 'VPBank', name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng', aliases: ['VPB', 'Thinh Vuong'] },
  { bin: '970403', shortName: 'Sacombank', name: 'Ngân hàng TMCP Sài Gòn Thương Tín', aliases: ['STB', 'Sacom', 'Sai Gon Thuong Tin'] },
  { bin: '970441', shortName: 'VIB', name: 'Ngân hàng TMCP Quốc tế Việt Nam', aliases: ['VIB', 'Quoc te'] },
  { bin: '970405', shortName: 'Agribank', name: 'Ngân hàng Nông nghiệp & PTNT Việt Nam', aliases: ['AGRI', 'VBA', 'Nong nghiep'] },
  { bin: '970448', shortName: 'OCB', name: 'Ngân hàng TMCP Phương Đông', aliases: ['OCB', 'Phuong Dong'] },
  { bin: '970426', shortName: 'MSB', name: 'Ngân hàng TMCP Hàng Hải Việt Nam', aliases: ['MSB', 'Maritime', 'Hang Hai'] },
  { bin: '970437', shortName: 'HDBank', name: 'Ngân hàng TMCP Phát triển TP.HCM', aliases: ['HDB', 'Phat trien'] },
  { bin: '970409', shortName: 'BacABank', name: 'Ngân hàng TMCP Bắc Á', aliases: ['BAB', 'NASB', 'Bac A'] },
  { bin: '970431', shortName: 'Eximbank', name: 'Ngân hàng TMCP Xuất Nhập Khẩu VN', aliases: ['EIB', 'Exim', 'Xuat Nhap Khau'] },
] as const;

function stripSearchAccents(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

/**
 * Search Vietnamese banks by abbreviation/alias (e.g. VCB, TCB, MB), short name, full name, or BIN,
 * ranking exact and prefix alias matches ahead of substring matches.
 */
export function searchVnBanks(query: string): VnBankInfo[] {
  const q = stripSearchAccents(query.trim());
  if (!q) return [...VN_BANKS];

  const ranked: Array<{ bank: VnBankInfo; rank: number }> = [];
  for (const bank of VN_BANKS) {
    const shortLower = stripSearchAccents(bank.shortName);
    const nameLower = stripSearchAccents(bank.name);
    const aliasesLower = bank.aliases.map((a) => stripSearchAccents(a));

    let rank: number | null = null;
    if (aliasesLower.some((a) => a === q)) {
      rank = 0;
    } else if (shortLower === q) {
      rank = 1;
    } else if (aliasesLower.some((a) => a.startsWith(q))) {
      rank = 2;
    } else if (shortLower.startsWith(q)) {
      rank = 3;
    } else if (
      aliasesLower.some((a) => a.includes(q)) ||
      shortLower.includes(q) ||
      nameLower.includes(q) ||
      bank.bin.includes(q)
    ) {
      rank = 4;
    }

    if (rank !== null) {
      ranked.push({ bank, rank });
    }
  }

  ranked.sort((a, b) => a.rank - b.rank);
  return ranked.map((entry) => entry.bank);
}

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
