/** Grupo de autenticación: si ya hay sesión, fuera de aquí. */

import { Redirect, Stack } from 'expo-router';

import { useAuthStore } from '@/src/store/auth';

export default function AuthLayout() {
  const status = useAuthStore((s) => s.status);

  if (status === 'authenticated') {
    return <Redirect href="/" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="recover" />
      <Stack.Screen name="register" />
    </Stack>
  );
}