import React, { useEffect, useRef } from 'react';
import {
  createBottomTabNavigator,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import IconActivity from '../../assets/figma/icon-activity.svg';
import IconGroups from '../../assets/figma/icon-groups.svg';
import IconHome from '../../assets/figma/icon-home.svg';
import IconProfile from '../../assets/figma/icon-profile.svg';
import { AccountScreen } from '../screens/account/AccountScreen';
import { ActivityScreen } from '../screens/activity/ActivityScreen';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { GroupsScreen } from '../screens/groups/GroupsScreen';
import { useGroupsStore } from '../store/groupsStore';
import { colors, fonts, shadows } from '../theme/tokens';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

interface AnimatedTabItemProps {
  routeName: keyof MainTabParamList;
  label: string;
  isFocused: boolean;
  badgeCount: number;
  onPress: () => void;
}

function AnimatedTabItem({
  routeName,
  label,
  isFocused,
  badgeCount,
  onPress,
}: AnimatedTabItemProps) {
  const pillScale = useRef(new Animated.Value(isFocused ? 1 : 0.82)).current;
  const pillOpacity = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  const iconTranslateY = useRef(new Animated.Value(isFocused ? -1 : 0)).current;
  const iconScale = useRef(new Animated.Value(isFocused ? 1.06 : 1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(pillScale, {
        toValue: isFocused ? 1 : 0.82,
        friction: 7,
        tension: 220,
        useNativeDriver: true,
      }),
      Animated.timing(pillOpacity, {
        toValue: isFocused ? 1 : 0,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.spring(iconTranslateY, {
        toValue: isFocused ? -1.5 : 0,
        friction: 6,
        tension: 250,
        useNativeDriver: true,
      }),
      Animated.spring(iconScale, {
        toValue: isFocused ? 1.08 : 1,
        friction: 6,
        tension: 250,
        useNativeDriver: true,
      }),
    ]).start();
  }, [iconScale, iconTranslateY, isFocused, pillOpacity, pillScale]);

  const renderIcon = () => {
    switch (routeName) {
      case 'DashboardTab':
        return <IconHome width={22} height={22} />;
      case 'GroupsTab':
        return <IconGroups width={22} height={22} />;
      case 'ActivityTab':
        return <IconActivity width={22} height={22} />;
      case 'AccountTab':
        return <IconProfile width={22} height={22} />;
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      onPress={onPress}
      style={tabStyles.tabItem}
    >
      <View style={tabStyles.pillWrap}>
        <Animated.View
          pointerEvents="none"
          style={[
            tabStyles.activePillBg,
            {
              opacity: pillOpacity,
              transform: [{ scale: pillScale }],
            },
          ]}
        />
        <Animated.View
          style={{
            transform: [{ translateY: iconTranslateY }, { scale: iconScale }],
          }}
        >
          {renderIcon()}
        </Animated.View>
        {badgeCount > 0 ? (
          <View style={tabStyles.badge}>
            <Text style={tabStyles.badgeText}>
              {badgeCount > 9 ? '9+' : badgeCount}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={[tabStyles.label, isFocused && tabStyles.activeLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ChiaNeTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const pendingConfirmationsCount = useGroupsStore(
    (s) => s.dashboard?.pendingConfirmationsCount ?? 0
  );

  return (
    <View style={[tabStyles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const { options } = descriptors[route.key] ?? {};
        const label =
          typeof options?.tabBarLabel === 'string'
            ? options.tabBarLabel
            : route.name;
        const routeName = route.name as keyof MainTabParamList;

        return (
          <AnimatedTabItem
            key={route.key}
            routeName={routeName}
            label={label}
            isFocused={isFocused}
            badgeCount={routeName === 'ActivityTab' ? pendingConfirmationsCount : 0}
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
          />
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
    ...shadows.card,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    gap: 4,
  },
  pillWrap: {
    width: 48,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  activePillBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 15,
    backgroundColor: colors.lime,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.coral,
    borderWidth: 1.5,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: fonts.bold,
    fontSize: 9,
    lineHeight: 11,
    color: colors.white,
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
