import { Tabs } from 'expo-router';

import { HapticTab } from '@/src/components/haptic-tab';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { useColorScheme } from '@/src/hooks/use-color-scheme';
import { colors } from '@/src/theme/tokens';

export default function TabLayout() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = colors[colorScheme];

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.onSurfaceVariant,
        tabBarStyle: { backgroundColor: theme.surfaceContainerLow },
        headerShown: false,
        tabBarButton: HapticTab,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Cosecha',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="agriculture" color={color} />,
        }}
      />
      <Tabs.Screen
        name="trazabilidad"
        options={{
          title: 'Trazabilidad',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="account_tree" color={color} />,
        }}
      />
      <Tabs.Screen
        name="mercado"
        options={{
          title: 'Mercado',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="storefront" color={color} />,
        }}
      />
      <Tabs.Screen
        name="ajustes"
        options={{
          title: 'Ajustes',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="settings" color={color} />,
        }}
      />
    </Tabs>
  );
}