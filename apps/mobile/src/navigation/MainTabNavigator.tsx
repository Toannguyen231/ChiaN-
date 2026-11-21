import React from 'react';
import {
  createBottomTabNavigator,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import IconActivity from '../../assets/figma/icon-activity.svg';
import IconGroups from '../../assets/figma/icon-groups.svg';
import IconHome from '../../assets/figma/icon-home.svg';
import IconProfile from '../../assets/figma/icon-profile.svg';
import { AccountScreen } from '../screens/account/AccountScreen';
import { ActivityScreen } from '../screens/activity/ActivityScreen';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { GroupsScreen } from '../screens/groups/GroupsScreen';
import { colors, fonts } from '../theme/tokens';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

function ChiaNeTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[tabStyles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const { options } = descriptors[route.key] ?? {};
        const label =
          typeof options?.tabBarLabel === 'string'
            ? options.tabBarLabel
            : route.name;

        const renderIcon = () => {
          switch (route.name as keyof MainTabParamList) {
            case 'DashboardTab':
              return <IconHome width={23} height={23} />;
            case 'GroupsTab':
              return <IconGroups width={23} height={23} />;
            case 'ActivityTab':
              return <IconActivity width={23} height={23} />;
            case 'AccountTab':
              return <IconProfile width={23} height={23} />;
          }
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            }}
            style={tabStyles.tabItem}
          >
            <View style={[tabStyles.pill, isFocused && tabStyles.activePill]}>
              {renderIcon()}
            </View>
            <Text style={[tabStyles.label, isFocused && tabStyles.activeLabel]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <ChiaNeTabBar {...props} />}
    >
      <Tab.Screen
        name="DashboardTab"
        component={DashboardScreen}
        options={{ tabBarLabel: 'Trang chủ' }}
      />
      <Tab.Screen
        name="GroupsTab"
        component={GroupsScreen}
        options={{ tabBarLabel: 'Nhóm' }}
      />
      <Tab.Screen
        name="ActivityTab"
        component={ActivityScreen}
        options={{ tabBarLabel: 'Hoạt động' }}
      />
      <Tab.Screen
        name="AccountTab"
        component={AccountScreen}
        options={{ tabBarLabel: 'Cá nhân' }}
      />
    </Tab.Navigator>
  );
}

const tabStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    gap: 4,
  },
  pill: {
    width: 46,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activePill: {
    backgroundColor: colors.lime,
  },
  label: {
    fontFamily: fonts.regular,
    fontSize: 10,
    lineHeight: 14,
    color: colors.muted,
  },
  activeLabel: {
    fontFamily: fonts.semiBold,
    color: colors.forest,
  },
});
