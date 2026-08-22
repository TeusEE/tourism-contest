import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';

import { colors } from '@/src/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.subtle,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '여행 분석',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: 'map', android: 'map', web: 'map' }}
              tintColor={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="two"
        options={{
          title: '안내',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: 'info.circle', android: 'info', web: 'info' }}
              tintColor={color}
              size={24}
            />
          ),
        }}
      />
    </Tabs>
  );
}
