import { describe, expect, it } from 'vitest';
import {
  calculateEqualSplit,
  calculateItemizedSplit,
  calculateNetBalances,
  calculatePercentageSplit,
  optimizeSettlements,
  validateExactSplit,
} from '../index';

describe('split calculations & rounding', () => {
  it('distributes remainder +1 VND to earliest participants so total is preserved', () => {
    const shares = calculateEqualSplit(1_000_000, ['a', 'b', 'c']);
    expect(shares).toEqual([
      { memberId: 'a', amountVnd: 333_334 },
      { memberId: 'b', amountVnd: 333_333 },
      { memberId: 'c', amountVnd: 333_333 },
    ]);
    expect(shares.reduce((s, x) => s + x.amountVnd, 0)).toBe(1_000_000);
  });

  it('handles equal split when evenly divisible', () => {
    const shares = calculateEqualSplit(960_000, ['an', 'linh', 'minh', 'huy']);
    expect(shares.every((s) => s.amountVnd === 240_000)).toBe(true);
  });

  it('detects missing or excess amounts in exact custom split', () => {
    const mismatch = validateExactSplit(960_000, [
      { memberId: 'an', amountVnd: 300_000 },
      { memberId: 'linh', amountVnd: 240_000 },
      { memberId: 'minh', amountVnd: 220_000 },
      { memberId: 'huy', amountVnd: 180_000 },
    ]);
    expect(mismatch.valid).toBe(false);
    expect(mismatch.allocatedVnd).toBe(940_000);
    expect(mismatch.remainingVnd).toBe(20_000);
    expect(mismatch.diffVnd).toBe(20_000);

    const exact = validateExactSplit(960_000, [
      { memberId: 'an', amountVnd: 300_000 },
      { memberId: 'linh', amountVnd: 240_000 },
      { memberId: 'minh', amountVnd: 220_000 },
      { memberId: 'huy', amountVnd: 200_000 },
    ]);
    expect(exact.valid).toBe(true);
    expect(exact.diffVnd).toBe(0);
  });

  it('computes percentage split with largest-remainder rounding', () => {
    const shares = calculatePercentageSplit(1_000_000, [
      { memberId: 'a', percentageBps: 3333 },
      { memberId: 'b', percentageBps: 3333 },
      { memberId: 'c', percentageBps: 3334 },
    ]);
    expect(shares.reduce((s, x) => s + x.amountVnd, 0)).toBe(1_000_000);
    expect(shares.map((s) => s.amountVnd)).toEqual([333_300, 333_300, 333_400]);
  });
});

describe('debt calculation & minimum-transfer optimization', () => {
  it('reproduces Figma Đà Lạt balances and minimizes transfers', () => {
    const balances = [
      { memberId: 'an', netBalanceVnd: -400_000 },
      { memberId: 'linh', netBalanceVnd: 800_000 },
      { memberId: 'minh', netBalanceVnd: 160_000 },
      { memberId: 'huy', netBalanceVnd: -560_000 },
    ];

    const plan = optimizeSettlements(balances);
    expect(plan).toEqual([
      { fromMemberId: 'huy', toMemberId: 'linh', amountVnd: 560_000 },
      { fromMemberId: 'an', toMemberId: 'linh', amountVnd: 240_000 },
      { fromMemberId: 'an', toMemberId: 'minh', amountVnd: 160_000 },
    ]);
    expect(plan.reduce((s, t) => s + t.amountVnd, 0)).toBe(960_000);
  });

  it('only applies CONFIRMED settlements to member balances and ignores deleted expenses', () => {
    const members = ['an', 'linh', 'minh'];
    const expenses = [
      {
        amountVnd: 900_000,
        paidByMemberId: 'linh',
        splits: [
          { memberId: 'an', amountVnd: 300_000 },
          { memberId: 'linh', amountVnd: 300_000 },
          { memberId: 'minh', amountVnd: 300_000 },
        ],
      },
      {
        amountVnd: 300_000,
        paidByMemberId: 'an',
        deletedAt: '2026-11-20T12:00:00Z',
        splits: [
          { memberId: 'an', amountVnd: 150_000 },
          { memberId: 'minh', amountVnd: 150_000 },
        ],
      },
    ];

    const settlements = [
      { fromMemberId: 'an', toMemberId: 'linh', amountVnd: 300_000, status: 'REPORTED' as const },
      { fromMemberId: 'minh', toMemberId: 'linh', amountVnd: 100_000, status: 'CONFIRMED' as const },
    ];

    const balances = calculateNetBalances(members, expenses, settlements);
    expect(balances).toEqual([
      { memberId: 'an', netBalanceVnd: -300_000 },
      { memberId: 'linh', netBalanceVnd: 500_000 },
      { memberId: 'minh', netBalanceVnd: -200_000 },
    ]);
  });

  it('ignores expenses paid from the group pot when calculating personal net balances', () => {
    const members = ['an', 'linh', 'minh'];
    const expenses = [
      {
        amountVnd: 600_000,
        paidByMemberId: 'linh',
        isPaidFromPot: true,
        splits: [
          { memberId: 'an', amountVnd: 200_000 },
          { memberId: 'linh', amountVnd: 200_000 },
          { memberId: 'minh', amountVnd: 200_000 },
        ],
      },
      {
        amountVnd: 300_000,
        paidByMemberId: 'an',
        isPaidFromPot: false,
        splits: [
          { memberId: 'an', amountVnd: 100_000 },
          { memberId: 'linh', amountVnd: 100_000 },
          { memberId: 'minh', amountVnd: 100_000 },
        ],
      },
    ];

    const balances = calculateNetBalances(members, expenses, []);
    expect(balances).toEqual([
      { memberId: 'an', netBalanceVnd: 200_000 },
      { memberId: 'linh', netBalanceVnd: -100_000 },
      { memberId: 'minh', netBalanceVnd: -100_000 },
    ]);
  });
});

describe('itemized bill splitting (Ai uong bia tick nguoi do)', () => {
  it('assigns specific items to subsets and splits remaining shared pool equally', () => {
    // 550k total: Beer 120k assigned to An & Minh; remaining 430k split across 4 (107.5k -> 107,500 each)
    const result = calculateItemizedSplit(550_000, ['an', 'linh', 'minh', 'huy'], [
      { name: 'Lẩu gà lá é', priceVnd: 380_000 },
      { name: 'Bia Sài Gòn (4 lon)', priceVnd: 120_000, assignedMemberIds: ['an', 'minh'] },
      { name: 'Bánh tráng & khăn lạnh', priceVnd: 50_000, assignedMemberIds: ['an', 'linh', 'minh', 'huy'] },
    ]);

    expect(result.overflowed).toBe(false);
    expect(result.assignedTotalVnd).toBe(120_000);
    expect(result.sharedPoolVnd).toBe(430_000);
    expect(result.shares).toEqual([
      { memberId: 'an', amountVnd: 167_500 },
      { memberId: 'linh', amountVnd: 107_500 },
      { memberId: 'minh', amountVnd: 167_500 },
      { memberId: 'huy', amountVnd: 107_500 },
    ]);
    expect(result.shares.reduce((s, x) => s + x.amountVnd, 0)).toBe(550_000);
  });

  it('handles odd rounding and discount overflow while strictly preserving totalVnd', () => {
    const oddResult = calculateItemizedSplit(200_000, ['a', 'b', 'c', 'd'], [
      { name: 'Đặc sản', priceVnd: 100_000, assignedMemberIds: ['a', 'b', 'c'] },
    ]);
    expect(oddResult.overflowed).toBe(false);
    expect(oddResult.shares.reduce((s, x) => s + x.amountVnd, 0)).toBe(200_000);
    expect(oddResult.shares).toEqual([
      { memberId: 'a', amountVnd: 58_334 },
      { memberId: 'b', amountVnd: 58_333 },
      { memberId: 'c', amountVnd: 58_333 },
      { memberId: 'd', amountVnd: 25_000 },
    ]);

    // Discount/voucher brings bill down to 150k while assigned items sum to 300k (a=100k, b=200k)
    const overflowResult = calculateItemizedSplit(150_000, ['a', 'b', 'c'], [
      { name: 'Món 1', priceVnd: 100_000, assignedMemberIds: ['a'] },
      { name: 'Món 2', priceVnd: 200_000, assignedMemberIds: ['b'] },
    ]);
    expect(overflowResult.overflowed).toBe(true);
    expect(overflowResult.sharedPoolVnd).toBe(0);
    expect(overflowResult.shares).toEqual([
      { memberId: 'a', amountVnd: 50_000 },
      { memberId: 'b', amountVnd: 100_000 },
      { memberId: 'c', amountVnd: 0 },
    ]);
    expect(overflowResult.shares.reduce((s, x) => s + x.amountVnd, 0)).toBe(150_000);
  });
});
