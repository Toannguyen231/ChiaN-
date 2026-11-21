import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  OtpVerify: {
    phone: string;
  };
  GuestJoin: {
    inviteCode: string;
  };
};

export type MainTabParamList = {
  DashboardTab: undefined;
  GroupsTab: undefined;
  ActivityTab: undefined;
  AccountTab: undefined;
};

export type AppStackParamList = {
  DisplayNameSetup: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  CreateGroup: undefined;
  GroupDetails: { groupId: string };
  GroupSettings: { groupId: string };
  MemberDetails: { groupId: string; memberId: string };
  InviteFriends: { groupId: string; fromCreate?: boolean };
  AddExpense: { groupId: string; expenseId?: string };
  SplitMethod: { groupId: string };
  ExpenseDetails: { expenseId: string };
  GroupBalances: { groupId: string };
  Payment: { groupId: string; toMemberId: string; amountVnd: number };
  BankTransferQr: {
    groupId: string;
    toMemberId: string;
    amountVnd: number;
    settlementId?: string;
  };
  WaitingConfirmation: { settlementId: string };
  ConfirmPaymentReceived: { settlementId: string };
  PaymentHistory: { groupId: string };
  FriendlyReminder: {
    groupId: string;
    recipientMemberId: string;
    creditorName?: string;
    amountVnd?: number;
  };
  PaymentCompleted: { settlementId: string };
  BankAccount: undefined;
  NotificationPreferences: undefined;
  PhoneChange: undefined;
  GuestJoin: { inviteCode: string };
  GuestUpgradeAuth: undefined;
  OfflineSaved: { groupId?: string };
};
