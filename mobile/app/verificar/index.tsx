import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { BrandMark } from '@/src/components/brand-mark';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { PrimaryButton } from '@/src/components/primary-button';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { spacing, typeScale, radii } from '@/src/theme/tokens';

export default function VerificarScreen() {
  const [codigo, setCodigo] = useState('');
  const [flashlightOn, setFlashlightOn] = useState(false);

  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const primaryContainer = useThemeColor('primaryContainer');
  const onPrimaryContainer = useThemeColor('onPrimaryContainer');
  const outline = useThemeColor('outline');
  const background = useThemeColor('background');

  const handleVerify = (codeToVerify: string) => {
    Haptics.selectionAsync();
    if (!codeToVerify) return;
    router.push(`/verificar/${codeToVerify}` as Href);
  };

  const handleClose = () => {
    Haptics.selectionAsync();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.push('/');
    }
  };

  const toggleFlashlight = () => {
    Haptics.selectionAsync();
    setFlashlightOn(prev => !prev);
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: background }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <BrandMark size={40} />
          <View style={styles.headerText}>
            <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }]}>VERIFICACIÓN PÚBLICA</Text>
            <Text style={[typeScale.headlineMedium, { color: onSurface }]}>Pasaporte</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Pressable onPress={toggleFlashlight} style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.7 : 1 }]}>
            <IconSymbol name={flashlightOn ? 'flash_on' : 'flash_off'} size={24} color={onSurface} />
          </Pressable>
          <Pressable onPress={handleClose} style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.7 : 1 }]}>
            <IconSymbol name="close" size={24} color={onSurface} />
          </Pressable>
        </View>
      </View>

      <View style={styles.scannerWrapper}>
        <View style={styles.scannerFrame}>
          <View style={styles.corners}>
            <View style={[styles.corner, styles.cornerTL, { borderColor: primaryContainer }]} />
            <View style={[styles.corner, styles.cornerTR, { borderColor: primaryContainer }]} />
            <View style={[styles.corner, styles.cornerBL, { borderColor: primaryContainer }]} />
            <View style={[styles.corner, styles.cornerBR, { borderColor: primaryContainer }]} />
          </View>
          <View style={styles.scannerContent}>
            <IconSymbol size={64} name="photo_camera" color={onSurfaceVariant} />
            <Text style={[typeScale.bodyLarge, { color: onSurfaceVariant }, styles.scannerText]}>
              Apunta al código QR del lote
            </Text>
            <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }, styles.scannerHint]}>
              Formato: BTR-XXXX-XXXX
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.manualInputSection}>
        <Text style={[typeScale.labelMedium, { color: onSurfaceVariant }]}>Ingresar código manualmente</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, typeScale.dataMono, { color: onSurface, borderColor: outline }]}
            placeholder="BTR-2024-XXXX"
            placeholderTextColor={onSurfaceVariant}
            value={codigo}
            onChangeText={setCodigo}
            autoCapitalize="characters"
          />
          <PrimaryButton label="Verificar" onPress={() => handleVerify(codigo)} disabled={!codigo} />
        </View>
      </View>

      <View style={styles.demoSection}>
        <Text style={[typeScale.labelMedium, { color: onSurfaceVariant }, styles.demoTitle]}>
          Probar con lote demo
        </Text>
        <View style={styles.demoButtons}>
          <Pressable
            onPress={() => handleVerify('BTR-2024-0042')}
            style={({ pressed }) => [styles.demoButton, { backgroundColor: primaryContainer, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={[typeScale.labelLarge, { color: onPrimaryContainer }]}>BTR-2024-0042</Text>
          </Pressable>
          <Pressable
            onPress={() => handleVerify('BTR-2024-0128')}
            style={({ pressed }) => [styles.demoButton, { backgroundColor: primaryContainer, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={[typeScale.labelLarge, { color: onPrimaryContainer }]}>BTR-2024-0128</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerText: {
    gap: spacing.xs,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  scannerFrame: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radii.large,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative',
  },
  corners: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: radii.large },
  cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: radii.large },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: radii.large },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: radii.large },
  scannerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  scannerText: {
    textAlign: 'center',
  },
  scannerHint: {
    textAlign: 'center',
    opacity: 0.7,
  },
  manualInputSection: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: 56,
    borderWidth: 1,
    borderRadius: radii.medium,
    paddingHorizontal: spacing.md,
  },
  demoSection: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    gap: spacing.md,
    alignItems: 'center',
  },
  demoTitle: {
    textAlign: 'center',
  },
  demoButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  demoButton: {
    borderRadius: radii.medium,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minWidth: 140,
    alignItems: 'center',
  },
});