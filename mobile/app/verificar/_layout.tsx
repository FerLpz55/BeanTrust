/** Grupo público: verificación sin autenticación (Pasaporte de Café). */

import { Stack } from 'expo-router';

export default function VerificarLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[codigo]" />
    </Stack>
  );
}