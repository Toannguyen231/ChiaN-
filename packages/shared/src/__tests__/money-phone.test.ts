import { describe, expect, it } from 'vitest';
import {
  formatVnd,
  formatVnPhoneDisplay,
  formatVnSubscriberInput,
  maskVnPhone,
  normalizeVnPhone,
  parseVndInput,
} from '../index';

describe('money & phone helpers', () => {
  it('formats integer VND amounts with dot separators', () => {
    expect(formatVnd(1280000)).toBe('1.280.000 ₫');
    expect(formatVnd(0)).toBe('0 ₫');
    expect(formatVnd(-400000)).toBe('−400.000 ₫');
    expect(formatVnd(800000, { showSign: true })).toBe('+800.000 ₫');
    expect(formatVnd(960000, { includeSymbol: false })).toBe('960.000');
  });

  it('rejects non-integer VND amounts', () => {
    expect(() => formatVnd(100.5)).toThrow();
  });

  it('parses VND input safely', () => {
    expect(parseVndInput('960.000 ₫')).toBe(960000);
    expect(parseVndInput('')).toBe(0);
    expect(parseVndInput('120k')).toBe(120000);
    expect(parseVndInput(' 120 K ')).toBe(120000);
    expect(parseVndInput('1.200k')).toBe(1200000);
    expect(() => parseVndInput('120kk')).toThrow();
    expect(() => parseVndInput('1,5k')).toThrow();
    expect(() => parseVndInput('1.5k')).toThrow();
    expect(() => parseVndInput('9007199254741k')).toThrow();
  });

  it('normalizes valid Vietnamese mobile numbers to E.164', () => {
    expect(normalizeVnPhone('0912345678')).toBe('+84912345678');
    expect(normalizeVnPhone('912 345 678')).toBe('+84912345678');
    expect(normalizeVnPhone('+84 912 345 678')).toBe('+84912345678');
    expect(normalizeVnPhone('84381234567')).toBe('+84381234567');
  });

  it('rejects invalid Vietnamese phone numbers', () => {
    expect(normalizeVnPhone('0123456789')).toBeNull();
    expect(normalizeVnPhone('12345')).toBeNull();
    expect(normalizeVnPhone('')).toBeNull();
  });

  it('formats and masks Vietnamese phone numbers for UI', () => {
    expect(formatVnPhoneDisplay('+84912345678')).toBe('+84 912 345 678');
    expect(maskVnPhone('+84912345678')).toBe('0912 ••• 678');
    expect(formatVnSubscriberInput('0912345678')).toBe('912 345 678');
  });
});
