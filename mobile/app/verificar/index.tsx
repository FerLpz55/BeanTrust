import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { router, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';

import { BrandMark } from '@/src/components/brand-mark';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { PrimaryButton } from '@/src/components/primary-button';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { spacing, typeScale, radii } from '@/src/theme/tokens';

export default function VerificarScreen() {
  const [codigo, setCodigo] = useState('');
  const [flashlightOn, setFlashlightOn] = useState(false);
  const [permiso, pedirPermiso] = useCameraPermissions();
  const enfocado = useIsFocused();
  // Evita que un QR sostenido dispare N navegaciones seguidas.
  const yaEscaneado = useRef(false);
  const timerRearme = useRef<ReturnType<typeof setTimeout> | null>(null);

  // La cámara solo vive con la pantalla enfocada y el bloqueo se rearma al
  // volver; los timers pendientes se cancelan al salir o desmontar.
  useEffect(() => {
    if (enfocado) yaEscaneado.current = false;
    return () => {
      if (timerRearme.current) {
        clearTimeout(timerRearme.current);
        timerRearme.current = null;
      }
    };
  }, [enfocado]);

  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const primaryContainer = useThemeColor('primaryContainer');
  const outline = useThemeColor('outline');
  const background = useThemeColor('background');

  const handleVerify = useCallback((codeToVerify: string) => {
    Haptics.selectionAsync();
    const limpio = codeToVerify.trim().toUpperCase();
    if (!limpio) return;
    router.push(`/verificar/${encodeURIComponent(limpio)}` as Href);
  }, []);

  const handleEscaneo = useCallback(
    ({ data }: BarcodeScanningResult) => {
      if (!enfocado || yaEscaneado.current) return;
      yaEscaneado.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      handleVerify(data);
      // Se rearma al volver del pasaporte (y se cancela al perder el foco).
      if (timerRearme.current) clearTimeout(timerRearme.current);
      timerRearme.current = setTimeout(() => {
        yaEscaneado.current = false;
        timerRearme.current = null;
      }, 1500);
    },
    [handleVerify, enfocado]
  );

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
            <IconSymbol name={flashlightOn ? 'flash-on' : 'flash-off'} size={24} color={onSurface} />
          </Pressable>
          <Pressable onPress={handleClose} style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.7 : 1 }]}>
            <IconSymbol name="close" size={24} color={onSurface} />
          </Pressable>
        </View>
      </View>

      <View style={styles.scannerWrapper}>
        <View style={styles.scannerFrame}>
          {permiso?.granted && enfocado ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              enableTorch={flashlightOn}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleEscaneo}
            />
          ) : null}
          {/* Decorativo: sin `pointerEvents="none"` este absoluteFill con
              zIndex 10 queda encima de todo y se come el toque del botón
              "Permitir cámara" (invisible en Expo Go, donde el permiso ya
              venía concedido y ese botón nunca se renderizaba). */}
          <View style={styles.corners} pointerEvents="none">
            <View style={[styles.corner, styles.cornerTL, { borderColor: primaryContainer }]} />
            <View style={[styles.corner, styles.cornerTR, { borderColor: primaryContainer }]} />
            <View style={[styles.corner, styles.cornerBL, { borderColor: primaryContainer }]} />
            <View style={[styles.corner, styles.cornerBR, { borderColor: primaryContainer }]} />
          </View>
          {!permiso?.granted ? (
            <View style={styles.scannerContent}>
              <IconSymbol size={64} name="photo-camera" color={onSurfaceVariant} />
              <Text style={[typeScale.bodyLarge, { color: onSurfaceVariant }, styles.scannerText]}>
                {!permiso
                  ? 'Preparando la cámara…'
                  : permiso.canAskAgain
                    ? 'Necesitamos la cámara para leer el código QR'
                    : 'Activa el permiso de cámara en los ajustes para escanear el QR'}
              </Text>
              {permiso && !permiso.granted ? (
                <PrimaryButton
                  label={permiso.canAskAgain ? 'Permitir cámara' : 'Abrir ajustes'}
                  onPress={() => {
                    // Tras dos negativas Android ignora la petición en silencio:
                    // ahí la única salida es la pantalla de ajustes de la app.
                    if (permiso.canAskAgain) void pedirPermiso();
                    else void Linking.openSettings();
                  }}
                />
              ) : null}
            </View>
          ) : null}
        </View>
        <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }, styles.scannerHint]}>
          Apunta al QR del Pasaporte de Café
        </Text>
      </View>

      <View style={styles.manualInputSection}>
        <Text style={[typeScale.labelMedium, { color: onSurfaceVariant }]}>Ingresar código manualmente</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, typeScale.dataMono, { color: onSurface, borderColor: outline }]}
            placeholder="BT-XXXXXXXXXX"
            placeholderTextColor={onSurfaceVariant}
            value={codigo}
            onChangeText={setCodigo}
            autoCapitalize="characters"
          />
          <PrimaryButton label="Verificar" onPress={() => handleVerify(codigo)} disabled={!codigo} />
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