/** Grupo autenticado: si no hay sesión, nadie entra a la finca. */

import { Redirect, Stack, router, useSegments } from 'expo-router';
import { useEffect } from 'react';

import { useAuthStore } from '@/src/store/auth';
import { usePerfilStore } from '@/src/store/perfil';
import { useSyncStore } from '@/src/store/sync';

export default function AppLayout() {
  const status = useAuthStore((s) => s.status);
  const usuarioId = useAuthStore((s) => s.usuarioId);
  const rol = useAuthStore((s) => s.rol);
  const inicializarSync = useSyncStore((s) => s.inicializar);
  const fincas = usePerfilStore((s) => s.fincas);
  const cargado = usePerfilStore((s) => s.cargado);
  const isLoadingFincas = usePerfilStore((s) => s.isLoading);
  const errorFincas = usePerfilStore((s) => s.error);
  const cargarFincas = usePerfilStore((s) => s.cargarFincas);
  const segments = useSegments();

  // Al restaurar/iniciar sesión se inicializa el almacén offline y se
  // dispara un primer flush (activador de login/restauración, §7.5).
  useEffect(() => {
    if (status === 'authenticated' && usuarioId) void inicializarSync(usuarioId);
  }, [status, usuarioId, inicializarSync]);

  // Un productor necesita su finca antes de operar: se consulta el directorio.
  // Un fallo (errorFincas) NO se reintenta en bucle; la UI ofrece reintento.
  useEffect(() => {
    if (status !== 'authenticated' || rol !== 'productor') return;
    if (!cargado && !isLoadingFincas && !errorFincas) void cargarFincas();
  }, [status, rol, cargado, isLoadingFincas, errorFincas, cargarFincas]);

  const necesitaOnboarding =
    status === 'authenticated' &&
    rol === 'productor' &&
    cargado &&
    !errorFincas &&
    fincas.length === 0;

  useEffect(() => {
    if (necesitaOnboarding && !segments.includes('onboarding-finca')) {
      router.replace('/onboarding-finca');
    }
  }, [necesitaOnboarding, segments]);

  if (status === 'unauthenticated') {
    return <Redirect href="/login" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding-finca" options={{ gestureEnabled: false }} />
      <Stack.Screen name="lotes/nuevo" options={{ presentation: 'modal' }} />
      <Stack.Screen name="mercado/[loteId]" />
      <Stack.Screen name="lotes/[id]" />
    </Stack>
  );
}
