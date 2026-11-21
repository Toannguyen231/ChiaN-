export interface FormatVndOptions {
  showSign?: boolean;
  includeSymbol?: boolean;
}

/**
 * Formats integer VND amounts using Vietnamese dot thousand separators.
 * Matches Figma typography conventions (e.g., "1.280.000 ₫", "−400.000 ₫", "+800.000 ₫").
 */
export function formatVnd(amountVnd: number, options: FormatVndOptions = {}): string {
  if (!Number.isFinite(amountVnd) || !Number.isInteger(amountVnd)) {
    throw new Error(`Invalid integer VND amount: ${amountVnd}`);
  }

  const { showSign = false, includeSymbol = true } = options;
  const abs = Math.abs(amountVnd);
  const grouped = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  let prefix = '';
  if (amountVnd < 0) {
    prefix = '−';
  } else if (showSign && amountVnd > 0) {
    prefix = '+';
  }

  return includeSymbol ? `${prefix}${grouped} ₫` : `${prefix}${grouped}`;
}

/**
 * Parses a formatted Vietnamese currency input (e.g., "960.000 ₫") into a safe non-negative integer.
 */
export function parseVndInput(raw: string): number {
  const digits = raw.replace(/\D/g, '');
  if (!digits) {
    return 0;
  }
  const parsed = Number.parseInt(digits, 10);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error('Số tiền vượt quá giới hạn hợp lệ');
  }
  return parsed;
}
