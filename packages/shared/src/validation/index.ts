import { z } from 'zod';

const VN_SUBSCRIBER_REGEX = /^[35789]\d{8}$/;

/**
 * Normalizes a Vietnamese mobile phone input into canonical E.164 format (+84XXXXXXXXX).
 * Supports inputs such as "0912345678", "912 345 678", "+84 912 345 678", or "84912345678".
 */
export function normalizeVnPhone(input: string): string | null {
  const compact = input.trim().replace(/[\s.\-()]/g, '');
  if (!compact) {
    return null;
  }

  let subscriber = '';
  if (compact.startsWith('+84')) {
    subscriber = compact.slice(3);
  } else if (compact.startsWith('84') && compact.length === 11) {
    subscriber = compact.slice(2);
  } else if (compact.startsWith('0') && compact.length === 10) {
    subscriber = compact.slice(1);
  } else if (/^\d{9}$/.test(compact)) {
    subscriber = compact;
  } else {
    return null;
  }

  if (!VN_SUBSCRIBER_REGEX.test(subscriber)) {
    return null;
  }

  return `+84${subscriber}`;
}

/**
 * Formats canonical +84XXXXXXXXX phone to "+84 912 345 678" for display.
 */
export function formatVnPhoneDisplay(e164: string): string {
  const normalized = normalizeVnPhone(e164);
  if (!normalized) {
    return e164;
  }
  const digits = normalized.slice(3);
  return `+84 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`;
}

/**
 * Formats a Vietnamese phone number as "0912 ••• 678" matching Figma Screen 17.
 */
export function maskVnPhone(e164: string): string {
  const normalized = normalizeVnPhone(e164);
  if (!normalized) {
    return e164;
  }
  const local = `0${normalized.slice(3)}`;
  return `${local.slice(0, 4)} ••• ${local.slice(7, 10)}`;
}

/**
 * Formats subscriber digits (up to 9 digits) into "912 345 678" while typing.
 */
export function formatVnSubscriberInput(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('84') && digits.length > 9) {
    digits = digits.slice(2);
  }
  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  digits = digits.slice(0, 9);

  const part1 = digits.slice(0, 3);
  const part2 = digits.slice(3, 6);
  const part3 = digits.slice(6, 9);
  return [part1, part2, part3].filter(Boolean).join(' ');
}

export const vnPhoneSchema = z
  .string()
  .trim()
  .min(9, 'Vui lòng nhập số điện thoại hợp lệ')
  .transform((value, ctx) => {
    const normalized = normalizeVnPhone(value);
    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Số điện thoại Việt Nam chưa đúng định dạng (ví dụ 912 345 678)',
      });
      return z.NEVER;
    }
    return normalized;
  });

export const requestOtpSchema = z.object({
  phone: vnPhoneSchema,
});

export const verifyOtpSchema = z.object({
  phone: vnPhoneSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Mã xác thực gồm đúng 6 chữ số'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().trim().min(16, 'Refresh token không hợp lệ'),
});

export const logoutSchema = z.object({
  refreshToken: z.string().trim().min(16).optional(),
});

export const updateProfileSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1, 'Tên hiển thị không được để trống')
      .max(60, 'Tên hiển thị tối đa 60 ký tự')
      .optional(),
    bankBin: z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'Mã BIN ngân hàng gồm 6 chữ số')
      .nullable()
      .optional(),
    bankName: z.string().trim().max(80).nullable().optional(),
    bankAccountNumber: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]{4,24}$/, 'Số tài khoản gồm 4–24 ký tự chữ/số')
      .nullable()
      .optional(),
    bankAccountHolder: z.string().trim().max(80).nullable().optional(),
    notifyReminders: z.boolean().optional(),
    notifyExpenses: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Không có thông tin cần cập nhật',
  });

export const groupCategorySchema = z.enum(['TRAVEL', 'FOOD', 'HOUSEHOLD', 'OTHER']);
export const expenseCategorySchema = z.enum(['FOOD', 'STAY', 'TRANSPORT', 'COFFEE', 'OTHER']);
export const splitMethodSchema = z.enum(['EQUAL', 'EXACT', 'PERCENTAGE']);
export const settlementMethodSchema = z.enum(['BANK_TRANSFER', 'CASH']);

export const createGroupSchema = z.object({
  name: z.string().trim().min(1, 'Vui lòng nhập tên nhóm').max(80),
  category: groupCategorySchema.default('TRAVEL'),
  currency: z.literal('VND').default('VND'),
});

export const updateGroupSchema = z
  .object({
    name: z.string().trim().min(1, 'Tên nhóm không được để trống').max(80).optional(),
    category: groupCategorySchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Không có thông tin nhóm cần cập nhật',
  });

export const archiveGroupSchema = z.object({
  archived: z.boolean().default(true),
});

export const addMemberSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'Vui lòng nhập tên thành viên')
    .max(60, 'Tên thành viên tối đa 60 ký tự'),
  phone: vnPhoneSchema.optional(),
});

const expenseSplitEntrySchema = z.object({
  memberId: z.string().trim().min(1),
  amountVnd: z.number().int().nonnegative().optional(),
  percentageBps: z.number().int().nonnegative().max(10000).optional(),
});

export const createExpenseSchema = z.object({
  title: z.string().trim().min(1, 'Vui lòng nhập tên khoản chi').max(120),
  amountVnd: z.number().int().positive('Số tiền phải lớn hơn 0'),
  category: expenseCategorySchema.default('FOOD'),
  splitMethod: splitMethodSchema.default('EQUAL'),
  paidByMemberId: z.string().trim().min(1),
  expenseDate: z.string().datetime().optional(),
  note: z.string().trim().max(300).optional(),
  receiptImageUrl: z.string().trim().max(10_000_000).nullable().optional(),
  isPaidFromPot: z.boolean().optional().default(false),
  clientMutationId: z.string().trim().min(8).max(120).optional(),
  splits: z.array(expenseSplitEntrySchema).min(1, 'Cần ít nhất 1 người tham gia'),
});

export const updateExpenseSchema = z
  .object({
    title: z.string().trim().min(1, 'Vui lòng nhập tên khoản chi').max(120).optional(),
    amountVnd: z.number().int().positive('Số tiền phải lớn hơn 0').optional(),
    category: expenseCategorySchema.optional(),
    splitMethod: splitMethodSchema.optional(),
    paidByMemberId: z.string().trim().min(1).optional(),
    expenseDate: z.string().datetime().optional(),
    note: z.string().trim().max(300).nullable().optional(),
    receiptImageUrl: z.string().trim().max(10_000_000).nullable().optional(),
    isPaidFromPot: z.boolean().optional(),
    splits: z.array(expenseSplitEntrySchema).min(1).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Không có thông tin khoản chi cần cập nhật',
  });

export const reportSettlementSchema = z.object({
  fromMemberId: z.string().trim().min(1),
  toMemberId: z.string().trim().min(1),
  amountVnd: z.number().int().positive('Số tiền thanh toán phải lớn hơn 0'),
  method: settlementMethodSchema.default('BANK_TRANSFER'),
  memo: z.string().trim().max(140).optional(),
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
});

export const rejectSettlementSchema = z.object({
  reason: z.string().trim().max(240).optional(),
});

export const sendReminderSchema = z.object({
  recipientMemberId: z.string().trim().min(1),
  amountVnd: z.number().int().positive(),
  message: z.string().trim().min(1).max(300),
});

export const joinGuestSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'Vui lòng nhập tên hiển thị của bạn')
    .max(60, 'Tên hiển thị tối đa 60 ký tự'),
});

export const claimGuestSchema = z.object({
  guestToken: z.string().trim().min(16, 'Guest token không hợp lệ'),
});

export const syncMutationsSchema = z.object({
  mutations: z
    .array(
      z.object({
        clientMutationId: z.string().trim().min(8).max(120),
        type: z.literal('CREATE_EXPENSE'),
        groupId: z.string().trim().min(1),
        payload: createExpenseSchema.omit({ clientMutationId: true }),
      })
    )
    .max(50),
});

export const changePhoneRequestSchema = z.object({
  phone: vnPhoneSchema,
});

export const changePhoneVerifySchema = z.object({
  phone: vnPhoneSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Mã xác thực gồm đúng 6 chữ số'),
});

export const scanReceiptSchema = z.object({
  imageBase64: z
    .string()
    .min(10, 'Dữ liệu ảnh không hợp lệ')
    .max(12_000_000, 'Kích thước ảnh vượt quá giới hạn cho phép'),
  mimeType: z.string().optional().default('image/jpeg'),
});

export type ScanReceiptInput = z.infer<typeof scanReceiptSchema>;

export const contributePotSchema = z.object({
  memberId: z.string().trim().min(1).optional(),
  amountVnd: z.number().int().positive('Số tiền góp quỹ phải lớn hơn 0'),
  note: z.string().trim().max(200).optional(),
});

export type ContributePotInput = z.infer<typeof contributePotSchema>;
