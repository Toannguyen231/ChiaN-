import type { ExpenseCategory, GroupMemberRole, SplitMethod } from '@chiane/shared';
import type { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import { buildGroupPotDto } from '../routes/pot.routes';
import { getGroupDetailForMember } from './group.service';

const FOREST_HEX = 'FF173E32';
const LIME_HEX = 'FFD3F54E';
const ZEBRA_HEX = 'FFF7F5EE';
const WHITE_HEX = 'FFFFFFFF';
const BORDER_HEX = 'FFDCE3DE';

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  FOOD: 'Ăn uống',
  COFFEE: 'Cà phê / Đồ uống',
  STAY: 'Lưu trú',
  TRANSPORT: 'Di chuyển',
  OTHER: 'Khác',
};

const SPLIT_LABELS: Record<SplitMethod, string> = {
  EQUAL: 'Chia đều',
  EXACT: 'Theo số tiền cụ thể',
  PERCENTAGE: 'Theo phần trăm',
};

const ROLE_LABELS: Record<GroupMemberRole, string> = {
  ADMIN: 'Trưởng nhóm',
  MEMBER: 'Thành viên',
  GUEST: 'Khách',
};

const SETTLEMENT_STATUS_LABELS: Record<string, string> = {
  REPORTED: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  REJECTED: 'Đã từ chối',
};

const SETTLEMENT_METHOD_LABELS: Record<string, string> = {
  BANK_TRANSFER: 'Chuyển khoản / VietQR',
  CASH: 'Tiền mặt',
};

function styleHeaderRow(row: ExcelJS.Row): void {
  row.height = 24;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: WHITE_HEX }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FOREST_HEX } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    cell.border = {
      bottom: { style: 'thin', color: { argb: BORDER_HEX } },
    };
  });
}

function styleBannerRow(row: ExcelJS.Row, accent = false): void {
  row.height = 26;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: accent ? FOREST_HEX : WHITE_HEX }, size: 13 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: accent ? LIME_HEX : FOREST_HEX },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  });
}

function formatIsoDateVn(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toISOString().slice(0, 10);
}

function slugifyExportName(name: string): string {
  const clean = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return clean || 'Nhom-ChiaNe';
}

export interface GroupExcelExportResult {
  buffer: Buffer;
  filename: string;
}

/**
 * Generate a 4-sheet Excel (.xlsx) financial report for a ChiaNè group.
 */
export async function buildGroupExcelExport(
  prisma: PrismaClient,
  groupId: string,
  myMemberId: string,
  myRole: GroupMemberRole
): Promise<GroupExcelExportResult> {
  const [detail, pot, settlements] = await Promise.all([
    getGroupDetailForMember(prisma, groupId, myMemberId, myRole),
    buildGroupPotDto(prisma, groupId, myMemberId),
    prisma.settlement.findMany({
      where: { groupId },
      include: {
        fromMember: { select: { displayName: true } },
        toMember: { select: { displayName: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
    }),
  ]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ChiaNè App';
  workbook.created = new Date();

  // Sheet 1: Tổng quan
  const overview = workbook.addWorksheet('Tổng quan', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  overview.columns = [
    { key: 'colA', width: 28 },
    { key: 'colB', width: 24 },
    { key: 'colC', width: 22 },
    { key: 'colD', width: 26 },
    { key: 'colE', width: 32 },
  ];

  const banner = overview.addRow([`BÁO CÁO CHI TIÊU NHÓM — ${detail.name}`]);
  overview.mergeCells(`A${banner.number}:E${banner.number}`);
  styleBannerRow(banner);

  const summaryRows: Array<[string, string | number, boolean]> = [
    ['Tên nhóm', detail.name, false],
    ['Số thành viên', detail.memberCount, false],
    ['Số khoản chi', detail.expenseCount, false],
    ['Tổng chi tiêu cả nhóm (VND)', detail.totalSpentVnd, true],
    ['Quỹ chung đã góp (VND)', pot.totalContributedVnd, true],
    ['Quỹ chung đã chi (VND)', pot.totalSpentFromPotVnd, true],
    ['Số dư quỹ chung còn lại (VND)', pot.remainingPotVnd, true],
    ['Ngày xuất báo cáo', formatIsoDateVn(new Date()), false],
  ];

  for (const [label, value, isMoney] of summaryRows) {
    const row = overview.addRow([label, value]);
    row.getCell(1).font = { bold: true };
    if (isMoney) {
      row.getCell(2).numFmt = '#,##0 "₫"';
    }
  }

  overview.addRow([]);
  const memberHeader = overview.addRow([
    'Thành viên',
    'Vai trò',
    'Số dư ròng (VND)',
    'Trạng thái công nợ',
    'Tài khoản nhận VietQR',
  ]);
  styleHeaderRow(memberHeader);

  detail.members.forEach((member, idx) => {
    const statusText =
      member.netBalanceVnd > 0
        ? 'Được nhận lại'
        : member.netBalanceVnd < 0
          ? 'Cần trả thêm'
          : 'Đã sòng phẳng';
    const bankText = member.bankPreview?.hasRealBank
      ? `${member.bankPreview.bankName ?? ''} ${member.bankPreview.maskedAccountNumber ?? ''}`.trim()
      : 'Chưa liên kết';
    const row = overview.addRow([
      member.displayName,
      ROLE_LABELS[member.role] ?? member.role,
      member.netBalanceVnd,
      statusText,
      bankText,
    ]);
    row.getCell(3).numFmt = '#,##0 "₫"';
    if (idx % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA_HEX } };
      });
    }
  });

  // Sheet 2: Chi tiết khoản chi
  const expensesSheet = workbook.addWorksheet('Chi tiết khoản chi', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  expensesSheet.columns = [
    { key: 'idx', width: 6 },
    { key: 'date', width: 14 },
    { key: 'title', width: 28 },
    { key: 'category', width: 18 },
    { key: 'amount', width: 18 },
    { key: 'payer', width: 22 },
    { key: 'splitMethod', width: 20 },
    { key: 'splitCount', width: 14 },
    { key: 'note', width: 24 },
    { key: 'splitDetail', width: 42 },
  ];
  styleHeaderRow(
    expensesSheet.addRow([
      'STT',
      'Ngày chi',
      'Tên khoản chi',
      'Danh mục',
      'Số tiền (VND)',
      'Nguồn chi / Người trả',
      'Cách chia',
      'Số người',
      'Ghi chú',
      'Chi tiết chia từng người',
    ])
  );

  detail.expenses.forEach((expense, idx) => {
    const splitSummary = expense.splits
      .map((s) => `${s.memberName}: ${s.amountVnd.toLocaleString('vi-VN')}đ`)
      .join(' | ');
    const row = expensesSheet.addRow([
      idx + 1,
      formatIsoDateVn(expense.expenseDate),
      expense.title,
      CATEGORY_LABELS[expense.category] ?? expense.category,
      expense.amountVnd,
      expense.isPaidFromPot ? 'Quỹ chung nhóm' : expense.paidByName,
      SPLIT_LABELS[expense.splitMethod] ?? expense.splitMethod,
      expense.splitCount,
      expense.note ?? '',
      splitSummary,
    ]);
    row.getCell(5).numFmt = '#,##0 "₫"';
    if (idx % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA_HEX } };
      });
    }
  });

  // Sheet 3: Lịch sử thanh toán
  const settlementsSheet = workbook.addWorksheet('Lịch sử thanh toán', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  settlementsSheet.columns = [
    { key: 'idx', width: 6 },
    { key: 'createdAt', width: 14 },
    { key: 'from', width: 22 },
    { key: 'to', width: 22 },
    { key: 'amount', width: 18 },
    { key: 'method', width: 22 },
    { key: 'status', width: 18 },
    { key: 'resolvedAt', width: 16 },
    { key: 'memo', width: 28 },
  ];
  styleHeaderRow(
    settlementsSheet.addRow([
      'STT',
      'Ngày tạo',
      'Người chuyển',
      'Người nhận',
      'Số tiền (VND)',
      'Phương thức',
      'Trạng thái',
      'Ngày xác nhận',
      'Ghi chú / Lý do',
    ])
  );

  settlements.forEach((s, idx) => {
    const resolved = s.confirmedAt ?? s.rejectedAt;
    const row = settlementsSheet.addRow([
      idx + 1,
      formatIsoDateVn(s.createdAt),
      s.fromMember.displayName,
      s.toMember.displayName,
      s.amountVnd,
      SETTLEMENT_METHOD_LABELS[s.method] ?? s.method,
      SETTLEMENT_STATUS_LABELS[s.status] ?? s.status,
      resolved ? formatIsoDateVn(resolved) : '',
      s.rejectReason || s.memo || '',
    ]);
    row.getCell(5).numFmt = '#,##0 "₫"';
    if (idx % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA_HEX } };
      });
    }
  });

  // Sheet 4: Quỹ chung nhóm
  const potSheet = workbook.addWorksheet('Quỹ chung nhóm', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  potSheet.columns = [
    { key: 'colA', width: 24 },
    { key: 'colB', width: 22 },
    { key: 'colC', width: 22 },
    { key: 'colD', width: 24 },
  ];

  const potBanner = potSheet.addRow([
    `QUỸ CHUNG NHÓM (HEO ĐẤT) — Thủ quỹ: ${pot.custodian?.displayName ?? 'Chưa chỉ định'}`,
  ]);
  potSheet.mergeCells(`A${potBanner.number}:D${potBanner.number}`);
  styleBannerRow(potBanner, true);

  const potTotals = potSheet.addRow([
    'Tổng đã góp',
    pot.totalContributedVnd,
    'Còn lại',
    pot.remainingPotVnd,
  ]);
  potTotals.getCell(1).font = { bold: true };
  potTotals.getCell(2).numFmt = '#,##0 "₫"';
  potTotals.getCell(3).font = { bold: true };
  potTotals.getCell(4).numFmt = '#,##0 "₫"';

  potSheet.addRow([]);
  styleHeaderRow(
    potSheet.addRow(['Thành viên', 'Đã góp (VND)', 'Đã tiêu từ quỹ (VND)', 'Cần hoàn lại / Bù thêm'])
  );
  pot.memberSummaries.forEach((m, idx) => {
    const row = potSheet.addRow([
      m.displayName,
      m.contributedVnd,
      m.consumedFromPotVnd,
      m.netRefundVnd,
    ]);
    row.getCell(2).numFmt = '#,##0 "₫"';
    row.getCell(3).numFmt = '#,##0 "₫"';
    row.getCell(4).numFmt = '#,##0 "₫"';
    if (idx % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA_HEX } };
      });
    }
  });

  potSheet.addRow([]);
  styleHeaderRow(
    potSheet.addRow(['Ngày góp', 'Thành viên góp', 'Số tiền góp (VND)', 'Ghi chú'])
  );
  pot.contributions.forEach((c, idx) => {
    const row = potSheet.addRow([
      formatIsoDateVn(c.createdAt),
      c.memberName,
      c.amountVnd,
      c.note ?? '',
    ]);
    row.getCell(3).numFmt = '#,##0 "₫"';
    if (idx % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA_HEX } };
      });
    }
  });

  const rawBuffer = await workbook.xlsx.writeBuffer();
  const datePart = formatIsoDateVn(new Date());
  const filename = `ChiaNe-${slugifyExportName(detail.name)}-${datePart}.xlsx`;

  return {
    buffer: Buffer.from(rawBuffer),
    filename,
  };
}
