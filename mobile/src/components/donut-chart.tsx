/** Stub de DonutChart — reemplazar con implementación real (F04). */

import { View } from 'react-native';

export function DonutChart({ size }: { percentage: number; size: number; strokeWidth?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: 'rgba(0,0,0,0.1)' }} />;
}
