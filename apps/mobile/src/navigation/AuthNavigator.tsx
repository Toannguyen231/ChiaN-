import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GuestJoinScreen } from '../screens/guest/GuestJoinScreen';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { OtpVerifyScreen } from '../screens/auth/OtpVerifyScreen';
import { WelcomeScreen } from '../screens/auth/WelcomeScreen';
import type { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Welcome"
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="OtpVerify" component={OtpVerifyScreen} />
      <Stack.Screen name="GuestJoin" component={GuestJoinScreen} />
    </Stack.Navigator>
  );
}
