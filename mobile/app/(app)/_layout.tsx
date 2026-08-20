/** Grupo autenticado: si no hay sesión, nadie entra a la finca. */

import { Redirect, Stack } from 'expo-router';

import { useAuthStore } from '@/src/store/auth';

export default function AppLayout() {
  const status = useAuthStore((s) => s.status);

  if (status === 'unauthenticated') {
    return <Redirect href="/login" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="lotes/nuevo" options={{ presentation: 'modal' }} />
      <Stack.Screen name="mercado/[loteId]" />
      <Stack.Screen name="lotes/[id]" />
    </Stack>
  );
}