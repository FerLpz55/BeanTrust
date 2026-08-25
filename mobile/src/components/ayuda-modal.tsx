/** Modal "Ayuda y soporte" (F14) — FAQ estática + reporte de problemas real. */

import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { PrimaryButton } from '@/src/components/primary-button';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { radii, spacing, typeScale } from '@/src/theme/tokens';

const REPO_ISSUES_URL = 'https://github.com/FerLpz55/BeanTrust/issues';

const PREGUNTAS: { pregunta: string; respuesta: string }[] = [
  {
    pregunta: '¿Qué es el Pasaporte de Café?',
    respuesta:
      'El código QR que se emite al llegar a TOSTADO. Cualquiera lo escanea (sin cuenta) en "Escáner" y ve el origen, la variedad, el método y el historial completo del lote con su hash por etapa.',
  },
  {
    pregunta: '¿Qué diferencia hay entre roles?',
    respuesta:
      'Productor y cooperativa registran cosechas y avanzan el estado del lote; solo la cooperativa (o admin) registra la venta. El comprador no gestiona lotes: llega a ellos escaneando el QR y ahí ve el comercio justo y puede dejar propina.',
  },
  {
    pregunta: '¿El dinero es real?',
    respuesta:
      'No. BeanTrust es un entorno de demostración: los pagos y la confirmación en cadena están simulados (sin blockchain ni pasarela real).',
  },
  {
    pregunta: '¿Por qué no puedo editar un evento ya registrado?',
    respuesta:
      'La trazabilidad es de solo-inserción (append-only): cada etapa queda encadenada por hash y no se puede alterar. Es lo que hace verificable el Pasaporte de Café.',
  },
];

interface AyudaModalProps {
  visible: boolean;
  onClose: () => void;
}

export function AyudaModal({ visible, onClose }: AyudaModalProps) {
  const background = useThemeColor('background');
  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const surfaceContainerLow = useThemeColor('surfaceContainerLow');

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.root, { backgroundColor: background }]}>
        <View style={styles.header}>
          <Text style={[typeScale.titleLarge, { color: onSurface, flex: 1 }]}>Ayuda y soporte</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar" style={styles.closeBtn}>
            <IconSymbol name="close" size={28} color={onSurfaceVariant} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {PREGUNTAS.map((item) => (
            <View key={item.pregunta} style={[styles.card, { backgroundColor: surfaceContainerLow }]}>
              <Text style={[typeScale.titleMedium, { color: onSurface }]}>{item.pregunta}</Text>
              <Text style={[typeScale.bodyMedium, { color: onSurfaceVariant }]}>{item.respuesta}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.footer}>
          <PrimaryButton
            label="Reportar un problema"
            onPress={() => {
              Haptics.selectionAsync();
              void Linking.openURL(REPO_ISSUES_URL);
            }}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  card: {
    padding: spacing.lg,
    borderRadius: radii.large,
    gap: spacing.xs,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
});
