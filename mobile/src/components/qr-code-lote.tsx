/**
 * QR del Pasaporte de Café: codifica el `codigo` del certificado
 * (p.ej. "BT-XXXXXXXXXX"), el mismo valor que `verificar/index.tsx` lee al
 * escanear. El hash raíz no va en el QR (ADR-11 / §8): la API lo trae y
 * recalcula al verificar.
 */

import { StyleSheet, View, type ViewStyle } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { radii, spacing } from '@/src/theme/tokens';

// Blanco/negro puro a propósito (no tokens "Copa de cata"): un QR necesita
// contraste máximo para que cualquier cámara lo lea de verdad.
const QR_FONDO = '#FFFFFF';
const QR_COLOR = '#000000';

interface QrCodeLoteProps {
  codigo: string;
  size?: number;
  style?: ViewStyle;
}

export function QrCodeLote({ codigo, size = 180, style }: QrCodeLoteProps) {
  return (
    <View style={[styles.marco, { padding: spacing.md }, style]}>
      <QRCode value={codigo} size={size} color={QR_COLOR} backgroundColor={QR_FONDO} ecl="M" />
    </View>
  );
}

const styles = StyleSheet.create({
  marco: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.large,
    alignSelf: 'center',
  },
});
