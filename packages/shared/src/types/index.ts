export type GroupCategory = 'TRAVEL' | 'FOOD' | 'HOUSEHOLD' | 'OTHER';

export type GroupMemberRole = 'ADMIN' | 'MEMBER' | 'GUEST';

export type GroupMemberStatus = 'ACTIVE' | 'LEFT' | 'REMOVED';

export type ExpenseCategory = 'FOOD' | 'STAY' | 'TRANSPORT' | 'COFFEE' | 'OTHER';

export type SplitMethod = 'EQUAL' | 'EXACT' | 'PERCENTAGE';

export type SettlementMethod = 'BANK_TRANSFER' | 'CASH';

export type SettlementStatus = 'PENDING' | 'REPORTED' | 'CONFIRMED' | 'REJECTED';

export type ActivityType =
  | 'GROUP_CREATED'
  | 'MEMBER_JOINED'
  | 'MEMBER_LEFT'
  | 'MEMBER_REMOVED'
  | 'EXPENSE_CREATED'
  | 'EXPENSE_UPDATED'
  | 'EXPENSE_DELETED'
  | 'SETTLEMENT_REPORTED'
  | 'SETTLEMENT_CONFIRMED'
  | 'SETTLEMENT_REJECTED'
  | 'REMINDER_SENT'
  | 'POT_CONTRIBUTED';

export interface UserProfile {
  id: string;
  phone: string;
  maskedPhone: string;
  displayName: string;
  avatarUrl: string | null;
  bankBin: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountHolder: string | null;
  notifyReminders: boolean;
  notifyExpenses: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export interface OtpRequestResponse {
  phone: string;
  maskedPhone: string;
  expiresInSeconds: number;
  resendCooldownSeconds: number;
  devOtp?: string;
}

export interface OtpVerifyResponse extends AuthTokens {
  user: UserProfile;
  isNewUser: boolean;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  error: ApiErrorBody;
}

export interface BankAccountPreviewDto {
  bankBin: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  maskedAccountNumber: string | null;
  bankAccountHolder: string | null;
  hasRealBank: boolean;
}

export interface GroupSummaryDto {
  id: string;
  name: string;
  category: GroupCategory;
  currency: 'VND';
  inviteCode: string;
  inviteLink: string;
  isArchived: boolean;
  memberCount: number;
  expenseCount: number;
  totalSpentVnd: number;
  myBalanceVnd: number;
  myRole: GroupMemberRole;
  myMemberId: string;
  createdAt: string;
  updatedAt: string;
}

export interface GroupMemberDto {
  id: string;
  userId: string | null;
  displayName: string;
  role: GroupMemberRole;
  status: GroupMemberStatus;
  netBalanceVnd: number;
  isMe: boolean;
  bankPreview: BankAccountPreviewDto | null;
  joinedAt: string;
}

export interface ExpenseSplitDto {
  id: string;
  memberId: string;
  memberName: string;
  amountVnd: number;
  percentageBps: number | null;
  isPayer: boolean;
  isMe: boolean;
}

export interface ExpenseDto {
  id: string;
  groupId: string;
  title: string;
  amountVnd: number;
  category: ExpenseCategory;
  splitMethod: SplitMethod;
  paidByMemberId: string;
  paidByName: string;
  createdByMemberId: string;
  createdByName: string;
  expenseDate: string;
  note: string | null;
  receiptImageUrl: string | null;
  clientMutationId: string | null;
  isPaidFromPot: boolean;
  myShareVnd: number;
  splitCount: number;
  splits: ExpenseSplitDto[];
  createdAt: string;
  updatedAt: string;
}

export interface GroupDetailDto {
  id: string;
  name: string;
  category: GroupCategory;
  currency: 'VND';
  inviteCode: string;
  inviteLink: string;
  isArchived: boolean;
  memberCount: number;
  expenseCount: number;
  totalSpentVnd: number;
  myBalanceVnd: number;
  myMemberId: string;
  myRole: GroupMemberRole;
  pendingSettlementsCount: number;
  members: GroupMemberDto[];
  expenses: ExpenseDto[];
  createdAt: string;
  updatedAt: string;
}

export interface MemberTransactionDto {
  id: string;
  kind: 'EXPENSE' | 'SETTLEMENT';
  title: string;
  subtitle: string;
  amountVnd: number;
  signedImpactVnd: number;
  occurredAt: string;
  status?: SettlementStatus;
}

export interface MemberDetailDto {
  member: GroupMemberDto;
  groupId: string;
  groupName: string;
  totalPaidVnd: number;
  totalShareVnd: number;
  canRemove: boolean;
  transactions: MemberTransactionDto[];
}

export interface ActivityMetadata {
  expenseId?: string;
  settlementId?: string;
  memberId?: string;
  amountVnd?: number;
  category?: ExpenseCategory;
  status?: SettlementStatus;
}

export interface ActivityItemDto {
  id: string;
  groupId: string;
  groupName: string;
  actorMemberId: string | null;
  actorName: string | null;
  type: ActivityType;
  title: string;
  subtitle: string;
  metadata: ActivityMetadata | null;
  createdAt: string;
}

export interface DashboardDto {
  totalOwedToYouVnd: number;
  totalYouOweVnd: number;
  recentGroups: GroupSummaryDto[];
  pendingConfirmationsCount: number;
  recentActivities: ActivityItemDto[];
}

export interface MemberBalanceDto {
  memberId: string;
  displayName: string;
  role: GroupMemberRole;
  netBalanceVnd: number;
  isMe: boolean;
  bankPreview: BankAccountPreviewDto | null;
}

export interface SuggestedTransferDto {
  fromMemberId: string;
  fromName: string;
  toMemberId: string;
  toName: string;
  amountVnd: number;
  isFromMe: boolean;
  isToMe: boolean;
  toBankPreview: BankAccountPreviewDto | null;
}

export interface SettlementDto {
  id: string;
  groupId: string;
  groupName: string;
  fromMemberId: string;
  fromName: string;
  toMemberId: string;
  toName: string;
  amountVnd: number;
  method: SettlementMethod;
  status: SettlementStatus;
  memo: string | null;
  toBankPreview: BankAccountPreviewDto | null;
  vietQrPayload: string | null;
  idempotencyKey: string | null;
  canConfirm: boolean;
  canReject: boolean;
  reportedAt: string | null;
  confirmedAt: string | null;
  rejectedAt: string | null;
  rejectReason: string | null;
  createdAt: string;
}

export interface GroupBalancesDto {
  groupId: string;
  groupName: string;
  myMemberId: string;
  myNetBalanceVnd: number;
  memberBalances: MemberBalanceDto[];
  suggestedTransfers: SuggestedTransferDto[];
  pendingSettlements: SettlementDto[];
}

export interface ReminderDto {
  id: string;
  groupId: string;
  senderMemberId: string;
  senderName: string;
  recipientMemberId: string;
  recipientName: string;
  amountVnd: number;
  message: string;
  sentAt: string;
}

export interface InvitePreviewDto {
  groupId: string;
  name: string;
  category: GroupCategory;
  isArchived: boolean;
  memberCount: number;
  inviterName: string;
  inviteCode: string;
}

export interface GuestSessionDto {
  guestToken: string;
  groupId: string;
  groupName: string;
  memberId: string;
  displayName: string;
  role: 'GUEST';
}

export interface SyncExpensePayload {
  title: string;
  amountVnd: number;
  category: ExpenseCategory;
  splitMethod: SplitMethod;
  paidByMemberId: string;
  expenseDate?: string;
  note?: string;
  receiptImageUrl?: string | null;
  isPaidFromPot?: boolean;
  splits: Array<{
    memberId: string;
    amountVnd?: number;
    percentageBps?: number;
  }>;
}

export interface SyncMutationItem {
  clientMutationId: string;
  type: 'CREATE_EXPENSE';
  groupId: string;
  payload: SyncExpensePayload;
}

export interface SyncMutationResultDto {
  clientMutationId: string;
  status: 'SYNCED' | 'ALREADY_SYNCED' | 'FAILED';
  expenseId?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface ReceiptItemDto {
  name: string;
  priceVnd: number;
  quantity?: number;
  assignedMemberIds?: string[];
}

export interface ReceiptScanResultDto {
  totalVnd: number;
  detectedMerchant?: string | null;
  detectedCategory?: ExpenseCategory;
  date?: string | null;
  items: ReceiptItemDto[];
  notice?: string | null;
}

export interface GroupPotContributionDto {
  id: string;
  groupId: string;
  memberId: string;
  memberName: string;
  amountVnd: number;
  note: string | null;
  createdAt: string;
}

export interface GroupPotCustodianDto {
  memberId: string;
  displayName: string;
  isMe: boolean;
  bankPreview: BankAccountPreviewDto;
}

export interface GroupPotMemberSummaryDto {
  memberId: string;
  displayName: string;
  isMe: boolean;
  bankPreview: BankAccountPreviewDto | null;
  contributedVnd: number;
  consumedFromPotVnd: number;
  netRefundVnd: number;
}

export interface GroupPotDto {
  groupId: string;
  custodian: GroupPotCustodianDto | null;
  totalContributedVnd: number;
  totalSpentFromPotVnd: number;
  remainingPotVnd: number;
  contributions: GroupPotContributionDto[];
  memberSummaries: GroupPotMemberSummaryDto[];
}
