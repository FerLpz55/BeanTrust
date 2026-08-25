import { Tabs } from 'expo-router';

import { HapticTab } from '@/src/components/haptic-tab';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { useColorScheme } from '@/src/hooks/use-color-scheme';
import { useAuthStore } from '@/src/store/auth';
import { colors } from '@/src/theme/tokens';

export default function TabLayout() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = colors[colorScheme];
  const rol = useAuthStore((s) => s.rol);
  // El comprador no gestiona lotes (§10): llega a ellos escaneando el QR
  // desde Mercado, no desde Cosecha/Trazabilidad (F14).
  const esComprador = rol === 'comprador';

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
          href: esComprador ? null : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="agriculture" color={color} />,
        }}
      />
      <Tabs.Screen
        name="trazabilidad"
        options={{
          title: 'Trazabilidad',
          href: esComprador ? null : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="account-tree" color={color} />,
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