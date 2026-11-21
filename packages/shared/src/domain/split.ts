export interface SplitShare {
  memberId: string;
  amountVnd: number;
}

export interface ExactSplitValidation {
  valid: boolean;
  allocatedVnd: number;
  remainingVnd: number;
  diffVnd: number;
}

export interface PercentageSplitInput {
  memberId: string;
  percentageBps: number; // 10000 = 100.00%
}

function assertUniqueNonEmptyParticipants(memberIds: string[]): void {
  if (memberIds.length === 0) {
    throw new Error('Cần ít nhất 1 người tham gia chia tiền');
  }
  const unique = new Set(memberIds);
  if (unique.size !== memberIds.length) {
    throw new Error('Danh sách thành viên tham gia bị trùng lặp');
  }
}

/**
 * Splits an integer VND amount equally among participants.
 * Remainder (+1 VND) is assigned deterministically to the first `remainder` participants
 * so that the sum of shares always equals `totalVnd` (e.g. 1,000,000 / 3 -> 333,334 + 333,333 + 333,333).
 */
export function calculateEqualSplit(totalVnd: number, participantIds: string[]): SplitShare[] {
  if (!Number.isInteger(totalVnd) || totalVnd <= 0) {
    throw new Error('Tổng khoản chi phải là số nguyên dương');
  }
  assertUniqueNonEmptyParticipants(participantIds);

  const count = participantIds.length;
  const base = Math.floor(totalVnd / count);
  const remainder = totalVnd % count;

  const shares = participantIds.map((memberId, index) => ({
    memberId,
    amountVnd: base + (index < remainder ? 1 : 0),
  }));

  const sum = shares.reduce((acc, s) => acc + s.amountVnd, 0);
  if (sum !== totalVnd) {
    throw new Error(`Invariant failed: split sum ${sum} !== ${totalVnd}`);
  }

  return shares;
}

/**
 * Validates custom exact VND amounts entered per participant (Figma Screen 20).
 * diffVnd = totalVnd - allocatedVnd (positive = missing/Còn thiếu, negative = exceeded/Vượt quá).
 */
export function validateExactSplit(totalVnd: number, entries: SplitShare[]): ExactSplitValidation {
  if (!Number.isInteger(totalVnd) || totalVnd <= 0) {
    throw new Error('Tổng khoản chi phải là số nguyên dương');
  }
  assertUniqueNonEmptyParticipants(entries.map((e) => e.memberId));

  let allocatedVnd = 0;
  for (const entry of entries) {
    if (!Number.isInteger(entry.amountVnd) || entry.amountVnd < 0) {
      throw new Error(`Số tiền chia cho ${entry.memberId} phải là số nguyên không âm`);
    }
    allocatedVnd += entry.amountVnd;
  }

  const diffVnd = totalVnd - allocatedVnd;
  return {
    valid: diffVnd === 0,
    allocatedVnd,
    remainingVnd: Math.max(diffVnd, 0),
    diffVnd,
  };
}

/**
 * Splits an integer VND amount by basis points (10000 bps = 100.00%) using
 * Hamilton / largest-remainder allocation so integer VND shares always sum to `totalVnd`.
 */
export function calculatePercentageSplit(
  totalVnd: number,
  entries: PercentageSplitInput[]
): Array<SplitShare & { percentageBps: number }> {
  if (!Number.isInteger(totalVnd) || totalVnd <= 0) {
    throw new Error('Tổng khoản chi phải là số nguyên dương');
  }
  assertUniqueNonEmptyParticipants(entries.map((e) => e.memberId));

  let totalBps = 0;
  for (const entry of entries) {
    if (!Number.isInteger(entry.percentageBps) || entry.percentageBps < 0 || entry.percentageBps > 10000) {
      throw new Error('Phần trăm chia không hợp lệ');
    }
    totalBps += entry.percentageBps;
  }
  if (totalBps !== 10000) {
    throw new Error(`Tổng phần trăm phải bằng 100% (hiện tại ${(totalBps / 100).toFixed(2)}%)`);
  }

  const provisional = entries.map((entry, index) => {
    const numerator = totalVnd * entry.percentageBps;
    const floorAmount = Math.floor(numerator / 10000);
    const remainder = numerator % 10000;
    return {
      index,
      memberId: entry.memberId,
      percentageBps: entry.percentageBps,
      amountVnd: floorAmount,
      remainder,
    };
  });

  const baseSum = provisional.reduce((acc, item) => acc + item.amountVnd, 0);
  let missingVnd = totalVnd - baseSum;

  const byLargestRemainder = [...provisional].sort((a, b) => {
    if (b.remainder !== a.remainder) {
      return b.remainder - a.remainder;
    }
    return a.index - b.index;
  });

  for (let i = 0; i < missingVnd; i += 1) {
    const target = byLargestRemainder[i];
    if (target) {
      target.amountVnd += 1;
    }
  }

  const result = provisional.map(({ memberId, amountVnd, percentageBps }) => ({
    memberId,
    amountVnd,
    percentageBps,
  }));

  const finalSum = result.reduce((acc, item) => acc + item.amountVnd, 0);
  if (finalSum !== totalVnd) {
    throw new Error(`Invariant failed: percentage split sum ${finalSum} !== ${totalVnd}`);
  }

  return result;
}

export interface ItemizedSplitItem {
  name: string;
  priceVnd: number;
  assignedMemberIds?: string[];
}

export interface ItemizedSplitResult {
  shares: SplitShare[];
  assignedTotalVnd: number;
  sharedPoolVnd: number;
  overflowed: boolean;
}

/**
 * Splits a bill by assigning specific items to specific members while equally dividing
 * the remaining shared pool (unassigned items, taxes, or full-group items) among all participants.
 * If assigned items exceed `totalVnd` (e.g. voucher/discount applied to bill), scales proportionally
 * so exact integer VND shares always sum strictly to `totalVnd`.
 */
export function calculateItemizedSplit(
  totalVnd: number,
  participantIds: string[],
  items: ItemizedSplitItem[]
): ItemizedSplitResult {
  if (!Number.isInteger(totalVnd) || totalVnd <= 0) {
    throw new Error('Tổng khoản chi phải là số nguyên dương');
  }
  assertUniqueNonEmptyParticipants(participantIds);

  const participantSet = new Set(participantIds);
  const individuallyAssigned: Array<{ priceVnd: number; validAssignees: string[] }> = [];

  for (const item of items) {
    const itemPrice = Math.max(0, Math.round(item.priceVnd));
    if (itemPrice <= 0) continue;

    const assigneeSet = new Set(
      (item.assignedMemberIds ?? []).filter((id) => participantSet.has(id))
    );
    const validAssignees = participantIds.filter((id) => assigneeSet.has(id));

    if (validAssignees.length > 0 && validAssignees.length < participantIds.length) {
      individuallyAssigned.push({ priceVnd: itemPrice, validAssignees });
    }
  }

  const rawAssignedTotal = individuallyAssigned.reduce((sum, it) => sum + it.priceVnd, 0);

  if (rawAssignedTotal <= totalVnd) {
    const totals = new Map<string, number>(participantIds.map((id) => [id, 0]));

    for (const it of individuallyAssigned) {
      const itemShares = calculateEqualSplit(it.priceVnd, it.validAssignees);
      for (const s of itemShares) {
        totals.set(s.memberId, (totals.get(s.memberId) ?? 0) + s.amountVnd);
      }
    }

    const sharedPoolVnd = totalVnd - rawAssignedTotal;
    if (sharedPoolVnd > 0) {
      const sharedShares = calculateEqualSplit(sharedPoolVnd, participantIds);
      for (const s of sharedShares) {
        totals.set(s.memberId, (totals.get(s.memberId) ?? 0) + s.amountVnd);
      }
    }

    const shares = participantIds.map((memberId) => ({
      memberId,
      amountVnd: totals.get(memberId) ?? 0,
    }));

    const finalSum = shares.reduce((acc, s) => acc + s.amountVnd, 0);
    if (finalSum !== totalVnd) {
      throw new Error(`Invariant failed: itemized split sum ${finalSum} !== ${totalVnd}`);
    }

    return {
      shares,
      assignedTotalVnd: rawAssignedTotal,
      sharedPoolVnd,
      overflowed: false,
    };
  }

  // Overflow / discount case: assigned items sum > totalVnd -> scale proportionally via Hamilton method
  const rawWeights = new Map<string, number>(participantIds.map((id) => [id, 0]));
  for (const it of individuallyAssigned) {
    const shareWeight = it.priceVnd / it.validAssignees.length;
    for (const memberId of it.validAssignees) {
      rawWeights.set(memberId, (rawWeights.get(memberId) ?? 0) + shareWeight);
    }
  }

  const weightSum = Array.from(rawWeights.values()).reduce((sum, w) => sum + w, 0);
  const provisional = participantIds.map((memberId, index) => {
    const weight = rawWeights.get(memberId) ?? 0;
    const exact = weightSum > 0 ? (totalVnd * weight) / weightSum : 0;
    const floorAmount = Math.floor(exact);
    return {
      index,
      memberId,
      amountVnd: floorAmount,
      remainder: exact - floorAmount,
    };
  });

  const baseSum = provisional.reduce((acc, p) => acc + p.amountVnd, 0);
  const diff = totalVnd - baseSum;

  if (diff > 0) {
    const byLargestRemainder = [...provisional].sort((a, b) =>
      Math.abs(b.remainder - a.remainder) > 1e-12
        ? b.remainder - a.remainder
        : a.index - b.index
    );
    for (let i = 0; i < diff; i += 1) {
      const target = byLargestRemainder[i % byLargestRemainder.length];
      if (target) {
        target.amountVnd += 1;
      }
    }
  } else if (diff < 0) {
    const bySmallestRemainder = [...provisional]
      .filter((p) => p.amountVnd > 0)
      .sort((a, b) =>
        Math.abs(a.remainder - b.remainder) > 1e-12
          ? a.remainder - b.remainder
          : b.index - a.index
      );
    for (let i = 0; i < Math.abs(diff); i += 1) {
      const target = bySmallestRemainder[i % bySmallestRemainder.length];
      if (target && target.amountVnd > 0) {
        target.amountVnd -= 1;
      }
    }
  }

  const shares = provisional.map(({ memberId, amountVnd }) => ({
    memberId,
    amountVnd,
  }));

  const finalSum = shares.reduce((acc, s) => acc + s.amountVnd, 0);
  if (finalSum !== totalVnd) {
    throw new Error(`Invariant failed: itemized overflow split sum ${finalSum} !== ${totalVnd}`);
  }

  return {
    shares,
    assignedTotalVnd: rawAssignedTotal,
    sharedPoolVnd: 0,
    overflowed: true,
  };
}
