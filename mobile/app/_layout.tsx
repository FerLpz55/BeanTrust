import {
  Fraunces_600SemiBold,
  Fraunces_700Bold,
} from '@expo-google-fonts/fraunces';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import {
  WorkSans_400Regular,
  WorkSans_500Medium,
  WorkSans_600SemiBold,
  WorkSans_700Bold,
} from '@expo-google-fonts/work-sans';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import 'react-native-reanimated';

import { ErrorBoundary } from '@/src/components/error-boundary';
import { useColorScheme } from '@/src/hooks/use-color-scheme';
import { useAuthStore } from '@/src/store/auth';
import { colors } from '@/src/theme/tokens';

export const unstable_settings = {
  anchor: '(app)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme() ?? 'light';

  // Fuentes no bloqueantes: si tardan, el texto cae al sistema (sin splash blanco).
  const [, fontError] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    WorkSans_400Regular,
    WorkSans_500Medium,
    WorkSans_600SemiBold,
    WorkSans_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
  });
  const restore = useAuthStore((s) => s.restore);
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    restore();
  }, [restore]);

  if (fontError) {
    console.warn('[layout] error cargando fuentes:', fontError);
  }

  const base = colorScheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors[colorScheme].primary,
      background: colors[colorScheme].background,
      card: colors[colorScheme].surfaceContainerLow,
      text: colors[colorScheme].onSurface,
      border: colors[colorScheme].outlineVariant,
      notification: colors[colorScheme].error,
    },
  };

  return (
    <ThemeProvider value={navTheme}>
      <ErrorBoundary>
        {status === 'restoring' ? (
          <View style={[styles.loading, { backgroundColor: colors[colorScheme].background }]}>
            <ActivityIndicator size="large" color={colors[colorScheme].primary} />
          </View>
        ) : (
          <Stack>
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(app)" options={{ headerShown: false }} />
            <Stack.Screen name="verificar" options={{ headerShown: false }} />
          </Stack>
        )}
      </ErrorBoundary>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});