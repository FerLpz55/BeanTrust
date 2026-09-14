/** Grupo autenticado: si no hay sesión, nadie entra a la finca. */

import { Redirect, Stack } from 'expo-router';
import { useEffect } from 'react';

import { useAuthStore } from '@/src/store/auth';
import { useSyncStore } from '@/src/store/sync';

export default function AppLayout() {
  const status = useAuthStore((s) => s.status);
  const usuarioId = useAuthStore((s) => s.usuarioId);
  const inicializarSync = useSyncStore((s) => s.inicializar);

  // Al restaurar/iniciar sesión se inicializa el almacén offline y se
  // dispara un primer flush (activador de login/restauración, §7.5).
  useEffect(() => {
    if (status === 'authenticated' && usuarioId) void inicializarSync(usuarioId);
  }, [status, usuarioId, inicializarSync]);

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
