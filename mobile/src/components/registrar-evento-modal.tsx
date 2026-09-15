/**
 * Modal "Registrar evento" (F11) — avanza el lote por la máquina de estados.
 *
 * Solo ofrece las transiciones válidas desde el estado actual (espejo de
 * `MaquinaEstados` del backend, `src/domain/lote.ts`); el backend sigue
 * siendo quien valida de verdad (409 si algo no cuadra).
 *
 * Guiado, no un menú: se resalta UN "siguiente paso sugerido" (el primero
 * en el orden canónico entre las opciones válidas) para que el productor no
 * tenga que decidir entre 5 sub-etapas cada vez; el resto queda accesible
 * mas discreto detrás de "Otras opciones".
 */

import { useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { ApiError } from '@/src/api/client';
import type { EventoCreate } from '@/src/api/types';
import { detalleEvento, tituloEvento } from '@/src/domain/mensajes';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { PrimaryButton } from '@/src/components/primary-button';
import { TextField } from '@/src/components/text-field';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { nuevaClaveIdempotencia } from '@/src/utils/idempotencia';
import {
  CAMPOS_POR_TIPO,
  EVENTO_DESCRIPCION,
  EVENTO_ICONO,
  EVENTO_ORDEN,
  TRANSICIONES_VALIDAS,
  type EventoTipo,
  type LoteEstado,
} from '@/src/store/lotes';
import { radii, spacing, typeScale } from '@/src/theme/tokens';

interface RegistrarEventoModalProps {
  visible: boolean;
  estadoActual: LoteEstado;
  /** Tipos ya registrados al menos una vez (para sugerir el siguiente, no repetir). */
  completados: EventoTipo[];
  onClose: () => void;
  /** Devuelve `true` si el evento quedó encolado offline (pendiente de sync). */
  onSubmit: (evento: EventoCreate, claveIdempotencia: string) => Promise<boolean>;
}

export function RegistrarEventoModal({
  visible,
  estadoActual,
  completados,
  onClose,
  onSubmit,
}: RegistrarEventoModalProps) {
  const [tipo, setTipo] = useState<EventoTipo | null>(null);
  const [verOtras, setVerOtras] = useState(false);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [claveIdempotencia, setClaveIdempotencia] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registrado, setRegistrado] = useState<EventoTipo | null>(null);
  const [registradoPendiente, setRegistradoPendiente] = useState(false);
  // Bloqueo síncrono: `enviando` (estado) puede quedar "viejo" un instante
  // entre un doble-tap y el siguiente render, dejando pasar dos envíos con
  // la misma intención — el segundo choca contra el backend (409) aunque el
  // primero ya haya tenido éxito. El ref no tiene ese retraso.
  const enviandoRef = useRef(false);

  const background = useThemeColor('background');
  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const primary = useThemeColor('primary');
  const onPrimary = useThemeColor('onPrimary');
  const primaryContainer = useThemeColor('primaryContainer');
  const onPrimaryContainer = useThemeColor('onPrimaryContainer');
  const surfaceContainerLow = useThemeColor('surfaceContainerLow');
  const outlineVariant = useThemeColor('outlineVariant');
  const errorColor = useThemeColor('error');

  const opciones = useMemo(() => TRANSICIONES_VALIDAS[estadoActual] ?? [], [estadoActual]);
  // Progresivo: prioriza lo que aún NO se ha hecho, en orden canónico
  // (así "el siguiente evento sugiere el siguiente"); si ya se hizo todo lo
  // válido al menos una vez, cae de vuelta al primero (repetir sigue siendo
  // una opción legítima, p.ej. una segunda pasada de LAVADO).
  const sugerido = useMemo(() => {
    const pendientes = EVENTO_ORDEN.filter((t) => opciones.includes(t) && !completados.includes(t));
    return pendientes[0] ?? EVENTO_ORDEN.find((t) => opciones.includes(t)) ?? null;
  }, [opciones, completados]);
  const otras = useMemo(() => opciones.filter((op) => op !== sugerido), [opciones, sugerido]);
  const campos = tipo ? (CAMPOS_POR_TIPO[tipo] ?? []) : [];

  const cerrarYLimpiar = () => {
    setTipo(null);
    setVerOtras(false);
    setValores({});
    setClaveIdempotencia(null);
    setError(null);
    setRegistrado(null);
    setRegistradoPendiente(false);
    enviandoRef.current = false;
    onClose();
  };

  const elegirTipo = (t: EventoTipo) => {
    Haptics.selectionAsync();
    setTipo(t);
    setValores({});
    setError(null);
    // Se genera al iniciar la intención, no en cada envío/reintento (§6).
    setClaveIdempotencia(nuevaClaveIdempotencia());
  };

  const handleSubmit = async () => {
    if (!tipo || !claveIdempotencia || enviandoRef.current) return;
    enviandoRef.current = true;
    Haptics.selectionAsync();
    setEnviando(true);
    setError(null);
    try {
      const evento = { tipo } as EventoCreate;
      for (const campo of campos) {
        const bruto = valores[campo.key]?.trim();
        if (!bruto) continue;
        (evento as unknown as Record<string, unknown>)[campo.key] =
          campo.tipo === 'numero' ? Number(bruto) : bruto;
      }
      const pendiente = await onSubmit(evento, claveIdempotencia);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Confirmación explícita en vez de cerrar en silencio: sin esto el
      // productor no tiene forma de saber que sí se guardó.
      setRegistradoPendiente(pendiente);
      setRegistrado(tipo);
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(
        err instanceof ApiError
          ? err.message
          : 'No se pudo registrar el evento. Reintenta.'
      );
    } finally {
      setEnviando(false);
      enviandoRef.current = false;
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={cerrarYLimpiar}
    >
      <SafeAreaView style={[styles.root, { backgroundColor: background }]}>
        <View style={styles.header}>
          <Text style={[typeScale.titleLarge, { color: onSurface, flex: 1 }]}>
            {registrado
              ? tituloEvento(registradoPendiente)
              : tipo
                ? EVENTO_DESCRIPCION[tipo]
                : 'Registrar evento'}
          </Text>
          <Pressable
            onPress={cerrarYLimpiar}
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
            style={styles.closeBtn}
          >
            <IconSymbol name="close" size={28} color={onSurfaceVariant} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {registrado ? (
            <View style={[styles.successCard, { backgroundColor: primaryContainer }]}>
              <IconSymbol name="check-circle" size={32} color={onPrimaryContainer} />
              <Text style={[typeScale.titleMedium, { color: onPrimaryContainer }]}>
                {registrado} guardado
              </Text>
              <Text style={[typeScale.bodySmall, { color: onPrimaryContainer }]}>
                {detalleEvento(registrado, registradoPendiente)}
              </Text>
            </View>
          ) : !tipo ? (
            <>
              {opciones.length === 0 ? (
                <Text style={[typeScale.bodyMedium, { color: onSurfaceVariant }]}>
                  Este lote no tiene transiciones disponibles desde su estado actual.
                </Text>
              ) : (
                <>
                  {sugerido ? (
                    <View style={styles.sugeridoBlock}>
                      <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }]}>
                        SIGUIENTE PASO SUGERIDO
                      </Text>
                      <Pressable
                        onPress={() => elegirTipo(sugerido)}
                        style={({ pressed }) => [
                          styles.opcionRow,
                          styles.opcionSugerida,
                          { backgroundColor: primaryContainer, opacity: pressed ? 0.9 : 1 },
                        ]}
                      >
                        <IconSymbol name={EVENTO_ICONO[sugerido]} size={26} color={onPrimaryContainer} />
                        <View style={styles.opcionTexto}>
                          <Text style={[typeScale.titleMedium, { color: onPrimaryContainer }]}>
                            {sugerido}
                          </Text>
                          <Text style={[typeScale.bodySmall, { color: onPrimaryContainer }]}>
                            {EVENTO_DESCRIPCION[sugerido]}
                          </Text>
                        </View>
                        <IconSymbol name="chevron-right" size={20} color={onPrimaryContainer} />
                      </Pressable>
                    </View>
                  ) : null}

                  {otras.length > 0 ? (
                    verOtras ? (
                      <View style={styles.opciones}>
                        <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }]}>
                          OTRAS OPCIONES VÁLIDAS
                        </Text>
                        {otras.map((op) => (
                          <Pressable
                            key={op}
                            onPress={() => elegirTipo(op)}
                            style={({ pressed }) => [
                              styles.opcionRow,
                              { backgroundColor: surfaceContainerLow, opacity: pressed ? 0.9 : 1 },
                            ]}
                          >
                            <IconSymbol name={EVENTO_ICONO[op]} size={22} color={primary} />
                            <View style={styles.opcionTexto}>
                              <Text style={[typeScale.titleMedium, { color: onSurface }]}>{op}</Text>
                              <Text style={[typeScale.bodySmall, { color: onSurfaceVariant }]}>
                                {EVENTO_DESCRIPCION[op]}
                              </Text>
                            </View>
                            <IconSymbol name="chevron-right" size={20} color={onSurfaceVariant} />
                          </Pressable>
                        ))}
                      </View>
                    ) : (
                      <Pressable onPress={() => setVerOtras(true)} style={styles.verOtrasBtn}>
                        <Text style={[typeScale.labelLarge, { color: primary }]}>
                          Ver otras {otras.length} opciones válidas
                        </Text>
                      </Pressable>
                    )
                  ) : null}
                </>
              )}
            </>
          ) : (
            <View style={styles.form}>
              {campos.length === 0 ? (
                <Text style={[typeScale.bodyMedium, { color: onSurfaceVariant }]}>
                  Esta etapa no necesita datos adicionales. Confirma para registrarla.
                </Text>
              ) : (
                campos.map((campo) =>
                  campo.opciones ? (
                    <View key={campo.key} style={styles.chipField}>
                      <Text style={[typeScale.labelMedium, { color: onSurfaceVariant }]}>
                        {campo.label}
                      </Text>
                      <View style={styles.chipRow}>
                        {campo.opciones.map((op) => {
                          const activo = valores[campo.key] === op;
                          return (
                            <Pressable
                              key={op}
                              onPress={() => {
                                Haptics.selectionAsync();
                                setValores((v) => ({ ...v, [campo.key]: op }));
                              }}
                              style={[
                                styles.chip,
                                {
                                  backgroundColor: activo ? primary : surfaceContainerLow,
                                  borderColor: activo ? primary : outlineVariant,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  typeScale.labelMedium,
                                  { color: activo ? onPrimary : onSurfaceVariant },
                                ]}
                              >
                                {op}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ) : (
                    <TextField
                      key={campo.key}
                      testID={`evento-${campo.key}`}
                      label={campo.label}
                      value={valores[campo.key] ?? ''}
                      onChangeText={(v) => setValores((prev) => ({ ...prev, [campo.key]: v }))}
                      keyboardType={campo.tipo === 'numero' ? 'decimal-pad' : 'default'}
                    />
                  )
                )
              )}
              {error ? (
                <Text
                  style={[typeScale.bodyMedium, { color: errorColor }]}
                  accessibilityLiveRegion="polite"
                >
                  {error}
                </Text>
              ) : null}
            </View>
          )}
        </ScrollView>

        {registrado ? (
          <View style={[styles.footer, { borderTopColor: outlineVariant }]}>
            <PrimaryButton label="Listo" onPress={cerrarYLimpiar} />
          </View>
        ) : tipo ? (
          <View style={[styles.footer, { borderTopColor: outlineVariant }]}>
            <PrimaryButton
              label="Registrar"
              onPress={handleSubmit}
              loading={enviando}
              loadingLabel="Registrando…"
            />
          </View>
        ) : null}
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
  sugeridoBlock: {
    gap: spacing.sm,
  },
  opciones: {
    gap: spacing.sm,
  },
  opcionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.large,
  },
  opcionSugerida: {
    padding: spacing.lg,
  },
  opcionTexto: {
    flex: 1,
    gap: 2,
  },
  verOtrasBtn: {
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  form: {
    gap: spacing.lg,
  },
  chipField: {
    gap: spacing.sm,
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
    alignItems: 'center',
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
