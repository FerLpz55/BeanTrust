/** AuthShell: cascarón responsive del flujo de autenticación.
 *
 * Dirección "Copa de cata": espresso profundo + crema dorada + cereza del
 * cafeto. El contenido se centra sobre un degradado cálido (leche→tan del
 * espresso) con un lavado de crema dorada en la esquina y el sello como marca
 * de agua. En web/tablet el mismo contenido flota en una tarjeta con sombra.
 *
 * Los campos y botones no se tocan: esto solo orquesta el layout. Se usa un
 * solo árbol (sin Wide/Narrow) para no remontar los TextField al cruzar el
 * breakpoint, y un render inicial "sin medir" para evitar el mismatch de
 * hydration en web estático.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandMark } from '@/src/components/brand-mark';
import { ThemedView } from '@/src/components/themed-view';
import { useColorScheme } from '@/src/hooks/use-color-scheme';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { fonts, radii, spacing, typeScale } from '@/src/theme/tokens';

const CARD_BREAKPOINT = 700;
const COLUMN_MAX_WIDTH = 440;

interface AuthShellProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  signature?: boolean;
}

export function AuthShell({ eyebrow, title, subtitle, children, footer, signature = false }: AuthShellProps) {
  const { width } = useWindowDimensions();

  // SSR web envía width=0; medimos tras el primer render para evitar el
  // flash narrow→card y el mismatch de hydration en output estático.
  const [measuredWidth, setMeasuredWidth] = useState(0);
  useEffect(() => {
    setMeasuredWidth(width);
  }, [width]);
  const wide = measuredWidth >= CARD_BREAKPOINT;

  const colorScheme = useColorScheme() ?? 'light';
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const secondary = useThemeColor('secondary');
  const tertiary = useThemeColor('tertiary');
  const cardColor = useThemeColor('surfaceContainerLowest');
  const outlineVariant = useThemeColor('outlineVariant');
  const cardShadow =
    colorScheme === 'dark' ? '0 16px 48px rgba(0, 0, 0, 0.55)' : '0 16px 48px rgba(58, 29, 12, 0.18)';

  return (
    <ThemedView style={styles.root}>
      <AuthBackground wide={wide} />
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.root}
        >
          <ScrollView
            contentContainerStyle={wide ? styles.wideScroll : styles.narrowScroll}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <View
              style={[
                styles.column,
                wide && [styles.card, { backgroundColor: cardColor, borderColor: outlineVariant, boxShadow: cardShadow }],
              ]}
            >
              <View style={styles.header}>
                <View style={styles.headerRow}>
                  <BrandMark size={wide ? 48 : 28} />
                  <Text style={[typeScale.eyebrow, styles.eyebrow, { color: secondary }]}>{eyebrow}</Text>
                </View>
                <Text style={wide ? styles.titleWide : styles.titleNarrow}>{title}</Text>
                {subtitle ? (
                  <>
                    <View style={[styles.hairline, { backgroundColor: secondary }]} />
                    <Text style={[typeScale.bodyMedium, styles.subtitle, { color: onSurfaceVariant }]}>{subtitle}</Text>
                  </>
                ) : null}
              </View>

              {children}

              {footer ? <View style={styles.footer}>{footer}</View> : null}

              {signature ? (
                <View style={styles.signature} accessibilityElementsHidden>
                  <MaterialIcons name="eco" size={14} color={tertiary} />
                  <Text style={[typeScale.dataMono, { color: onSurfaceVariant }]}>BEAN TRUST · CERTIFICADO QR</Text>
                </View>
              ) : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

function AuthBackground({ wide }: { wide: boolean }) {
  const surface = useThemeColor('surface');
  const surfaceContainer = useThemeColor('surfaceContainer');
  const surfaceContainerHigh = useThemeColor('surfaceContainerHigh');
  const secondaryContainer = useThemeColor('secondaryContainer');
  const isDark = useColorScheme() === 'dark';
  const cremaWash = `${secondaryContainer}${isDark ? '47' : '8C'}`;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[surface, surfaceContainer, surfaceContainerHigh]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['#00000000', '#00000000', cremaWash]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.watermark, wide ? styles.watermarkWide : styles.watermarkNarrow]}>
        <BrandMark size={wide ? 340 : 220} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  narrowScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
  wideScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  column: {
    width: '100%',
    maxWidth: COLUMN_MAX_WIDTH,
    paddingHorizontal: spacing.xl,
    gap: 16,
  },
  card: {
    borderRadius: radii.extraLarge,
    borderWidth: 1,
    padding: 40,
  },
  header: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  eyebrow: {
    fontSize: 10,
  },
  titleNarrow: {
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.01,
    fontFamily: fonts.displayBold,
    textAlign: 'center',
  },
  titleWide: {
    fontSize: 40,
    lineHeight: 48,
    letterSpacing: -0.02,
    fontFamily: fonts.displayBold,
    textAlign: 'center',
  },
  hairline: {
    width: 48,
    height: 1,
    opacity: 0.35,
    marginTop: spacing.xs,
  },
  subtitle: {
    textAlign: 'center',
    maxWidth: 300,
  },
  footer: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  signature: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  watermark: {
    position: 'absolute',
    opacity: 0.08,
    transform: [{ rotate: '-12deg' }],
  },
  watermarkNarrow: {
    right: -60,
    bottom: -60,
  },
  watermarkWide: {
    right: -120,
    bottom: -120,
  },
});