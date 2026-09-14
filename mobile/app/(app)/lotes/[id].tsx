/**
 * Pantalla Detalle de Lote — muestra trazabilidad y detalles del lote.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { ApiError } from '@/src/api/client';
import type { EventoCreate } from '@/src/api/types';
import { RECHAZO_DISPONIBLE_DESDE, TRANSICIONES_VALIDAS, useLotesStore } from '@/src/store/lotes';
import { useAuthStore } from '@/src/store/auth';
import { usePerfilStore } from '@/src/store/perfil';
import { radii, spacing, typeScale } from '@/src/theme/tokens';
import { StatusChip } from '@/src/components/status-chip';
import { TrazaTimeline } from '@/src/components/traza-timeline';
import { PrimaryButton } from '@/src/components/primary-button';
import { RegistrarEventoModal } from '@/src/components/registrar-evento-modal';
import { RegistrarVentaModal } from '@/src/components/registrar-venta-modal';
import { QrCodeLote } from '@/src/components/qr-code-lote';
import { nuevaClaveIdempotencia } from '@/src/utils/idempotencia';

/** Rol que puede avanzar el lote por su máquina de estados (F11, §10). */
function puedeRegistrarEventos(rol: string | null): boolean {
  return rol === 'productor' || rol === 'cooperativa' || rol === 'admin';
}

/** Solo la cooperativa dueña de la finca (o admin) puede vender el lote (§9). */
function puedeVender(rol: string | null): boolean {
  return rol === 'cooperativa' || rol === 'admin';
}

export default function LoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // El detalle trae el historial real (`LoteDetalleRead`); la lista no.
  const lote = useLotesStore((s) => (id ? s.detalles[id] : undefined));
  const cargarDetalle = useLotesStore((s) => s.cargarDetalle);
  const avanzar = useLotesStore((s) => s.avanzar);
  const rol = useAuthStore((s) => s.rol);
  const fincas = usePerfilStore((s) => s.fincas);
  const [cargando, setCargando] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [ventaModalVisible, setVentaModalVisible] = useState(false);
  const [rechazando, setRechazando] = useState(false);
  const [errorRechazo, setErrorRechazo] = useState<string | null>(null);
  const [rechazoConfirmado, setRechazoConfirmado] = useState(false);
  // Bloqueo síncrono: ver la misma nota en `registrar-evento-modal.tsx`. Sin
  // esto, un segundo toque mientras el primero seguía en vuelo chocaba
  // contra el backend (409) aunque el primero ya hubiera rechazado el lote.
  const rechazandoRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    setCargando(true);
    void cargarDetalle(id).finally(() => setCargando(false));
  }, [id, cargarDetalle]);

  const fincaNombre = fincas.find((f) => f.id === lote?.finca_id)?.nombre ?? null;

  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const tertiaryContainerBg = useThemeColor('tertiaryContainer');
  const onTertiaryContainer = useThemeColor('onTertiaryContainer');
  const errorColor = useThemeColor('error');

  if (!lote) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={[typeScale.bodyLarge, { color: onSurfaceVariant }]}>
            {cargando ? 'Cargando lote…' : 'Lote no encontrado'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleBack = () => {
    Haptics.selectionAsync();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  // El backend emite el certificado solo al llegar a TOSTADO/VENDIDO
  // (`_emitir_certificado_si_corresponde`), así que aquí no se "genera":
  // se muestra el código real para que el consumidor lo verifique.
  const puedeVerificar = lote.certificado && lote.codigo_certificado !== null;

  const transicionesDisponibles = TRANSICIONES_VALIDAS[lote.estado] ?? [];
  // Tipos ya registrados al menos una vez: alimenta la sugerencia progresiva
  // del modal (`completados`, F11 — "que sugiera el siguiente evento").
  const completados = lote.historial.filter((e) => e.completed).map((e) => e.tipo);
  const puedeGestionar = puedeRegistrarEventos(rol);
  const puedeRechazar = puedeGestionar && RECHAZO_DISPONIBLE_DESDE.includes(lote.estado);
  const puedeRegistrarVenta = puedeVender(rol) && lote.estado === 'TOSTADO';

  const handleAvanzar = async (evento: EventoCreate, claveIdempotencia: string) => {
    await avanzar(lote.id, evento, claveIdempotencia);
  };

  const ejecutarRechazo = async () => {
    if (rechazandoRef.current) return;
    rechazandoRef.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setRechazando(true);
    setErrorRechazo(null);
    try {
      await avanzar(lote.id, { tipo: 'RECHAZADO' }, nuevaClaveIdempotencia());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setRechazoConfirmado(true);
    } catch (err) {
      setErrorRechazo(
        err instanceof ApiError ? err.message : 'No se pudo rechazar el lote. Reintenta.'
      );
    } finally {
      setRechazando(false);
      rechazandoRef.current = false;
    }
  };

  // Es destructivo e irreversible: confirmación explícita en vez de un solo
  // toque, así también se evita el doble-toque accidental (§ nota arriba).
  const handleRechazar = () => {
    if (rechazandoRef.current) return;
    Alert.alert(
      'Rechazar lote',
      `¿Seguro que quieres rechazar el lote ${lote.codigo_publico}? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Rechazar', style: 'destructive', onPress: () => void ejecutarRechazo() },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* HEADER */}
        <View style={styles.header}>
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.85 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Volver"
          >
            <IconSymbol name="arrow-back" size={24} color={onSurface} />
          </Pressable>
        </View>
        
        <View style={styles.titleSection}>
          <Text style={[typeScale.headlineMedium, { color: onSurface }]} numberOfLines={2}>
            {lote.variedad}
          </Text>
          <View style={styles.row}>
            <Text style={[typeScale.dataMono, { color: onSurfaceVariant }]}>
              {lote.codigo_publico}
            </Text>
            <StatusChip estado={lote.estado} />
          </View>
          <Text style={[typeScale.bodyMedium, { color: onSurfaceVariant }]}>
            {lote.metodo} • {lote.peso_actual_kg.toFixed(1)} kg
          </Text>
        </View>

        {/* INFO CARDS */}
        <View style={styles.infoGrid}>
          {!!(lote.altitud_min && lote.altitud_max) && (
            <InfoCard icon="terrain" label="Altitud" value={`${lote.altitud_min}-${lote.altitud_max} msnm`} />
          )}
          {!!lote.humedad_final_pct && (
            <InfoCard icon="water-drop" label="Humedad" value={`${lote.humedad_final_pct}%`} />
          )}
          {!!lote.puntaje_sca && (
            <InfoCard icon="star" label="Puntaje SCA" value={String(lote.puntaje_sca)} />
          )}
          {!!fincaNombre && <InfoCard icon="forest" label="Finca" value={fincaNombre} />}
        </View>

        {/* TIMELINE */}
        <View style={styles.timelineSection}>
          <Text style={[typeScale.labelLarge, { color: onSurface }]}>TRAZABILIDAD</Text>
          <Text style={[typeScale.bodySmall, { color: onSurfaceVariant, marginBottom: spacing.xl }]}>
            Cada etapa genera un hash criptográfico inmutable
          </Text>
          
          <TrazaTimeline events={lote.historial} />
        </View>

        {/* GESTIÓN DEL LOTE (F11) */}
        {puedeGestionar ? (
          <View style={styles.gestionSection}>
            {transicionesDisponibles.length > 0 ? (
              <PrimaryButton label="Registrar evento" onPress={() => setModalVisible(true)} />
            ) : null}
            {puedeRegistrarVenta ? (
              <PrimaryButton label="Registrar venta" onPress={() => setVentaModalVisible(true)} />
            ) : null}
            {puedeRechazar ? (
              <Pressable
                onPress={handleRechazar}
                disabled={rechazando}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.rechazarBtn,
                  { opacity: pressed || rechazando ? 0.7 : 1 },
                ]}
              >
                <Text style={[typeScale.labelLarge, { color: errorColor }]}>
                  {rechazando ? 'Rechazando…' : 'Rechazar lote'}
                </Text>
              </Pressable>
            ) : null}
            {rechazoConfirmado ? (
              <Text
                style={[typeScale.bodySmall, { color: onSurfaceVariant }]}
                accessibilityLiveRegion="polite"
              >
                Lote rechazado.
              </Text>
            ) : null}
            {errorRechazo ? (
              <Text
                style={[typeScale.bodySmall, { color: errorColor }]}
                accessibilityLiveRegion="polite"
              >
                {errorRechazo}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* ACTION BUTTON */}
        {puedeVerificar ? (
          <View style={styles.actionSection}>
            <QrCodeLote codigo={lote.codigo_certificado!} />
            <Text
              style={[typeScale.bodySmall, { color: onSurfaceVariant, textAlign: 'center' }]}
            >
              Código del Pasaporte de Café:{' '}
              <Text style={typeScale.dataMono}>{lote.codigo_certificado}</Text>
            </Text>
            <PrimaryButton
              label="Ver Pasaporte de Café"
              onPress={() => router.push(`/verificar/${lote.codigo_certificado}` as Href)}
            />
          </View>
        ) : (
          <View style={styles.actionSection}>
            <Text style={[typeScale.bodySmall, { color: onSurfaceVariant }]}>
              El Pasaporte de Café se emite al llegar a TOSTADO.
            </Text>
          </View>
        )}

        {/* HASH RAÍZ */}
        <View style={[styles.hashCard, { backgroundColor: tertiaryContainerBg }]}>
          <View style={styles.hashCardHeader}>
            <IconSymbol name="lock" size={16} color={onTertiaryContainer} />
            <Text style={[typeScale.eyebrow, { color: onTertiaryContainer }]}>HASH RAÍZ</Text>
          </View>
          <Text style={[styles.hashText, { color: onTertiaryContainer }]} selectable>
            {lote.hash_sha256}
          </Text>
        </View>

      </ScrollView>

      <RegistrarEventoModal
        visible={modalVisible}
        estadoActual={lote.estado}
        completados={completados}
        onClose={() => setModalVisible(false)}
        onSubmit={handleAvanzar}
      />
      <RegistrarVentaModal
        visible={ventaModalVisible}
        loteId={lote.id}
        onClose={() => setVentaModalVisible(false)}
        onVendido={() => void cargarDetalle(lote.id)}
      />
    </SafeAreaView>
  );
}

function InfoCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  const surfaceContainerLow = useThemeColor('surfaceContainerLow');
  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');

  return (
    <View style={[styles.infoCard, { backgroundColor: surfaceContainerLow }]}>
      <IconSymbol name={icon} size={20} color={onSurfaceVariant} />
      <View style={styles.infoCardText}>
        <Text style={[typeScale.bodySmall, { color: onSurfaceVariant }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[typeScale.labelMedium, { color: onSurface }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginLeft: -spacing.sm, // offsets the padding of the back button slightly to align visual center
  },
  backButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleSection: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  infoCard: {
    flex: 1,
    minWidth: '45%', // ensures 2 columns
    borderRadius: radii.medium,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  infoCardText: {
    flex: 1,
  },
  timelineSection: {
    marginBottom: spacing.xxl,
  },
  gestionSection: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  rechazarBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  actionSection: {
    marginBottom: spacing.xxl,
    gap: spacing.md,
  },
  hashCard: {
    padding: spacing.lg,
    borderRadius: radii.large,
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  hashCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  hashText: {
    ...typeScale.dataMono,
  },
});
