import React, { useEffect } from 'react';
import {
  NavigationContainer,
  type LinkingOptions,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import { BankAccountScreen } from '../screens/account/BankAccountScreen';
import { NotificationPreferencesScreen } from '../screens/account/NotificationPreferencesScreen';
import { PhoneChangeScreen } from '../screens/account/PhoneChangeScreen';
import { FriendlyReminderScreen } from '../screens/activity/FriendlyReminderScreen';
import { PaymentCompletedScreen } from '../screens/activity/PaymentCompletedScreen';
import { DisplayNameSetupScreen } from '../screens/auth/DisplayNameSetupScreen';
import { BankTransferQrScreen } from '../screens/debt/BankTransferQrScreen';
import { ConfirmPaymentReceivedScreen } from '../screens/debt/ConfirmPaymentReceivedScreen';
import { GroupBalancesScreen } from '../screens/debt/GroupBalancesScreen';
import { PaymentHistoryScreen } from '../screens/debt/PaymentHistoryScreen';
import { PaymentScreen } from '../screens/debt/PaymentScreen';
import { WaitingConfirmationScreen } from '../screens/debt/WaitingConfirmationScreen';
import { AddExpenseScreen } from '../screens/expenses/AddExpenseScreen';
import { ExpenseDetailsScreen } from '../screens/expenses/ExpenseDetailsScreen';
import { SplitMethodScreen } from '../screens/expenses/SplitMethodScreen';
import { CreateGroupScreen } from '../screens/groups/CreateGroupScreen';
import { GroupDetailsScreen } from '../screens/groups/GroupDetailsScreen';
import { GroupSettingsScreen } from '../screens/groups/GroupSettingsScreen';
import { InviteFriendsScreen } from '../screens/groups/InviteFriendsScreen';
import { MemberDetailsScreen } from '../screens/groups/MemberDetailsScreen';
import { GuestJoinScreen } from '../screens/guest/GuestJoinScreen';
import { OfflineSavedScreen } from '../screens/offline/OfflineSavedScreen';
import { useAuthStore } from '../store/authStore';
import { useOfflineQueueStore } from '../store/offlineQueueStore';
import { colors, fonts } from '../theme/tokens';
import { AuthNavigator } from './AuthNavigator';
import { MainTabNavigator } from './MainTabNavigator';
import type { AppStackParamList } from './types';

const AppStack = createNativeStackNavigator<AppStackParamList>();

const linking: LinkingOptions<AppStackParamList> = {
  prefixes: ['chiane://', 'https://chiane.app'],
  config: {
    screens: {
      MainTabs: {
        path: '',
        screens: {
          DashboardTab: 'home',
          GroupsTab: 'groups',
          ActivityTab: 'activity',
          AccountTab: 'account',
        },
      },
      GuestJoin: 'moi/:inviteCode',
    },
  },
};

export function RootNavigator() {
  const status = useAuthStore((s) => s.status);
  const guestSession = useAuthStore((s) => s.guestSession);
  const bootstrap = useAuthStore((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
    void useOfflineQueueStore.getState().hydrate();
  }, [bootstrap]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        return;
      }
      const authStatus = useAuthStore.getState().status;
      if (
        (authStatus === 'authenticated' || authStatus === 'guest') &&
        useOfflineQueueStore.getState().items.length > 0
      ) {
        void useOfflineQueueStore.getState().syncAll().catch(() => {});
      }
    });
    return () => {
      subscription.remove();
    };
  }, []);

  if (status === 'bootstrapping') {
    return (
      <View style={styles.splash}>
        <Text style={styles.brand}>ChiaNè</Text>
        <ActivityIndicator size="small" color={colors.lime} />
      </View>
    );
  }

  return (
    <NavigationContainer linking={linking}>
      {status === 'unauthenticated' ? (
        <AuthNavigator />
      ) : status === 'guest' && guestSession ? (
        <AppStack.Navigator
          key={guestSession.memberId}
          screenOptions={{ headerShown: false }}
          initialRouteName="GroupDetails"
        >
          <AppStack.Screen
            name="GroupDetails"
            component={GroupDetailsScreen}
            initialParams={{ groupId: guestSession.groupId }}
          />
          <AppStack.Screen name="MemberDetails" component={MemberDetailsScreen} />
          <AppStack.Screen name="AddExpense" component={AddExpenseScreen} />
          <AppStack.Screen name="SplitMethod" component={SplitMethodScreen} />
          <AppStack.Screen name="ExpenseDetails" component={ExpenseDetailsScreen} />
          <AppStack.Screen name="GroupBalances" component={GroupBalancesScreen} />
          <AppStack.Screen name="Payment" component={PaymentScreen} />
          <AppStack.Screen name="BankTransferQr" component={BankTransferQrScreen} />
          <AppStack.Screen name="WaitingConfirmation" component={WaitingConfirmationScreen} />
          <AppStack.Screen name="ConfirmPaymentReceived" component={ConfirmPaymentReceivedScreen} />
          <AppStack.Screen name="PaymentHistory" component={PaymentHistoryScreen} />
          <AppStack.Screen name="PaymentCompleted" component={PaymentCompletedScreen} />
          <AppStack.Screen name="OfflineSaved" component={OfflineSavedScreen} />
          <AppStack.Screen name="GuestJoin" component={GuestJoinScreen} />
        </AppStack.Navigator>
      ) : (
        <AppStack.Navigator screenOptions={{ headerShown: false }}>
          {status === 'needs_profile' ? (
            <AppStack.Screen
              name="DisplayNameSetup"
              component={DisplayNameSetupScreen}
            />
          ) : (
            <>
              <AppStack.Screen name="MainTabs" component={MainTabNavigator} />
              <AppStack.Screen name="CreateGroup" component={CreateGroupScreen} />
              <AppStack.Screen name="GroupDetails" component={GroupDetailsScreen} />
              <AppStack.Screen name="GroupSettings" component={GroupSettingsScreen} />
              <AppStack.Screen name="MemberDetails" component={MemberDetailsScreen} />
              <AppStack.Screen name="InviteFriends" component={InviteFriendsScreen} />
              <AppStack.Screen name="AddExpense" component={AddExpenseScreen} />
              <AppStack.Screen name="SplitMethod" component={SplitMethodScreen} />
              <AppStack.Screen name="ExpenseDetails" component={ExpenseDetailsScreen} />
              <AppStack.Screen name="GroupBalances" component={GroupBalancesScreen} />
              <AppStack.Screen name="Payment" component={PaymentScreen} />
              <AppStack.Screen name="BankTransferQr" component={BankTransferQrScreen} />
              <AppStack.Screen name="WaitingConfirmation" component={WaitingConfirmationScreen} />
              <AppStack.Screen name="ConfirmPaymentReceived" component={ConfirmPaymentReceivedScreen} />
              <AppStack.Screen name="PaymentHistory" component={PaymentHistoryScreen} />
              <AppStack.Screen name="FriendlyReminder" component={FriendlyReminderScreen} />
              <AppStack.Screen name="PaymentCompleted" component={PaymentCompletedScreen} />
              <AppStack.Screen name="BankAccount" component={BankAccountScreen} />
              <AppStack.Screen name="NotificationPreferences" component={NotificationPreferencesScreen} />
              <AppStack.Screen name="PhoneChange" component={PhoneChangeScreen} />
              <AppStack.Screen name="GuestJoin" component={GuestJoinScreen} />
              <AppStack.Screen name="OfflineSaved" component={OfflineSavedScreen} />
            </>
          )}
        </AppStack.Navigator>
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  brand: {
    fontFamily: fonts.extraBold,
    fontSize: 32,
    color: colors.lime,
  },
});
