/**
 * Modal "Registrar venta" — cooperativa/admin venden un lote TOSTADO.
 *
 * Dispara `POST /v1/pagos`: el backend simula el pago on-chain
 * (`FakeGatewayPagos`, patrón 97/3, `tx_hash` determinista) sin dinero real
 * ni blockchain real (web3 en pausa, B7). Esta pantalla es la que hace
 * visible esa simulación: muestra el `tx_hash` y el estado de confirmación
 * apenas el backend responde.
 */

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { ApiError } from '@/src/api/client';
import { crearPago, listarCompradores } from '@/src/api/pagos';
import type { PagoRead, UsuarioRead } from '@/src/api/types';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { PrimaryButton } from '@/src/components/primary-button';
import { TextField } from '@/src/components/text-field';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { nuevaClaveIdempotencia } from '@/src/utils/idempotencia';
import { radii, spacing, typeScale } from '@/src/theme/tokens';

interface RegistrarVentaModalProps {
  visible: boolean;
  loteId: string;
  onClose: () => void;
  /** Se llama tras una venta confirmada por el backend, para refrescar el lote. */
  onVendido: () => void;
}

export function RegistrarVentaModal({ visible, loteId, onClose, onVendido }: RegistrarVentaModalProps) {
  const [compradores, setCompradores] = useState<UsuarioRead[]>([]);
  const [cargandoCompradores, setCargandoCompradores] = useState(false);
  const [compradorId, setCompradorId] = useState<string | null>(null);
  const [monto, setMonto] = useState('');
  const [claveIdempotencia, setClaveIdempotencia] = useState(nuevaClaveIdempotencia);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pago, setPago] = useState<PagoRead | null>(null);
  // Bloqueo síncrono: mismo motivo que en `registrar-evento-modal.tsx`.
  const enviandoRef = useRef(false);

  const background = useThemeColor('background');
  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const primary = useThemeColor('primary');
  const onPrimary = useThemeColor('onPrimary');
  const surfaceContainerLow = useThemeColor('surfaceContainerLow');
  const outlineVariant = useThemeColor('outlineVariant');
  const errorColor = useThemeColor('error');
  const tertiaryContainer = useThemeColor('tertiaryContainer');
  const onTertiaryContainer = useThemeColor('onTertiaryContainer');

  useEffect(() => {
    if (!visible) return;
    setCargandoCompradores(true);
    listarCompradores()
      .then(setCompradores)
      .catch(() => setCompradores([]))
      .finally(() => setCargandoCompradores(false));
  }, [visible]);

  const cerrarYLimpiar = () => {
    setCompradorId(null);
    setMonto('');
    setError(null);
    setPago(null);
    setClaveIdempotencia(nuevaClaveIdempotencia());
    onClose();
  };

  const handleSubmit = async () => {
    const montoNum = Number(monto.replace(',', '.'));
    if (!compradorId || !montoNum || montoNum <= 0 || enviandoRef.current) return;
    enviandoRef.current = true;
    Haptics.selectionAsync();
    setEnviando(true);
    setError(null);
    try {
      const resultado = await crearPago(
        { lote_id: loteId, comprador_id: compradorId, monto_total: montoNum },
        claveIdempotencia
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPago(resultado);
      onVendido();
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err instanceof ApiError ? err.message : 'No se pudo registrar la venta. Reintenta.');
    } finally {
      setEnviando(false);
      enviandoRef.current = false;
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={cerrarYLimpiar}>
      <SafeAreaView style={[styles.root, { backgroundColor: background }]}>
        <View style={styles.header}>
          <Text style={[typeScale.titleLarge, { color: onSurface, flex: 1 }]}>
            {pago ? 'Venta registrada' : 'Registrar venta'}
          </Text>
          <Pressable onPress={cerrarYLimpiar} accessibilityRole="button" accessibilityLabel="Cerrar" style={styles.closeBtn}>
            <IconSymbol name="close" size={28} color={onSurfaceVariant} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {pago ? (
            <View style={[styles.successCard, { backgroundColor: tertiaryContainer }]}>
              <IconSymbol name="verified-user" size={32} color={onTertiaryContainer} />
              <Text style={[typeScale.eyebrow, { color: onTertiaryContainer }]}>
                ESTADO: {pago.estado_pago}
              </Text>
              <Text style={[typeScale.bodyMedium, { color: onTertiaryContainer }]}>
                97% productor (${pago.monto_productor.toFixed(2)}) · 3% cooperativa
              </Text>
              {pago.tx_hash ? (
                <>
                  <Text style={[typeScale.eyebrow, { color: onTertiaryContainer, marginTop: spacing.md }]}>
                    TX HASH SIMULADO
                  </Text>
                  <Text style={[typeScale.dataMono, { color: onTertiaryContainer }]} selectable>
                    {pago.tx_hash}
                  </Text>
                </>
              ) : null}
              <Text style={[typeScale.bodySmall, { color: onTertiaryContainer, marginTop: spacing.md }]}>
                La confirmación llega en segundo plano (poller simulado, sin blockchain real).
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.field}>
                <Text style={[typeScale.labelMedium, { color: onSurfaceVariant }]}>Comprador</Text>
                {cargandoCompradores ? (
                  <ActivityIndicator color={primary} style={styles.loader} />
                ) : compradores.length === 0 ? (
                  <Text style={[typeScale.bodyMedium, { color: onSurfaceVariant }]}>
                    No hay compradores registrados todavía.
                  </Text>
                ) : (
                  <View style={styles.chipRow}>
                    {compradores.map((c) => {
                      const activo = compradorId === c.id;
                      return (
                        <Pressable
                          key={c.id}
                          onPress={() => {
                            Haptics.selectionAsync();
                            setCompradorId(c.id);
                          }}
                          style={[
                            styles.chip,
                            { backgroundColor: activo ? primary : surfaceContainerLow, borderColor: activo ? primary : outlineVariant },
                          ]}
                        >
                          <Text style={[typeScale.labelMedium, { color: activo ? onPrimary : onSurfaceVariant }]}>
                            {c.nombre || c.email}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>

              <TextField
                testID="venta-monto"
                label="Monto total (MXN)"
                value={monto}
                onChangeText={setMonto}
                keyboardType="decimal-pad"
              />

              {error ? (
                <Text style={[typeScale.bodyMedium, { color: errorColor }]} accessibilityLiveRegion="polite">
                  {error}
                </Text>
              ) : null}
            </>
          )}
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: outlineVariant }]}>
          {pago ? (
            <PrimaryButton label="Listo" onPress={cerrarYLimpiar} />
          ) : (
            <PrimaryButton
              label="Registrar venta"
              onPress={handleSubmit}
              loading={enviando}
              loadingLabel="Enviando…"
              disabled={!compradorId || !monto}
            />
          )}
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
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  field: {
    gap: spacing.sm,
  },
  loader: {
    marginVertical: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  successCard: {
    padding: spacing.lg,
    borderRadius: radii.large,
    gap: spacing.xs,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
