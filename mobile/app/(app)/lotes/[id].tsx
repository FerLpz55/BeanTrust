/**
 * Pantalla Detalle de Lote — muestra trazabilidad y detalles del lote.
 */
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { useLotesStore } from '@/src/store/lotes';
import { usePerfilStore } from '@/src/store/perfil';
import { radii, spacing, typeScale } from '@/src/theme/tokens';
import { StatusChip } from '@/src/components/status-chip';
import { TrazaTimeline } from '@/src/components/traza-timeline';
import { PrimaryButton } from '@/src/components/primary-button';

export default function LoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // El detalle trae el historial real (`LoteDetalleRead`); la lista no.
  const lote = useLotesStore((s) => (id ? s.detalles[id] : undefined));
  const cargarDetalle = useLotesStore((s) => s.cargarDetalle);
  const fincas = usePerfilStore((s) => s.fincas);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!id) return;
    setCargando(true);
    void cargarDetalle(id).finally(() => setCargando(false));
  }, [id, cargarDetalle]);

  const fincaNombre = fincas.find((f) => f.id === lote?.finca_id)?.nombre ?? null;

  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const surfaceContainerLow = useThemeColor('surfaceContainerLow');
  const tertiaryContainerBg = useThemeColor('tertiaryContainer');
  const onTertiaryContainer = useThemeColor('onTertiaryContainer');

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
            <IconSymbol name="arrow_back" size={24} color={onSurface} />
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
            <InfoCard icon="water_drop" label="Humedad" value={`${lote.humedad_final_pct}%`} />
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

        {/* ACTION BUTTON */}
        {puedeVerificar ? (
          <View style={styles.actionSection}>
            <Text style={[typeScale.bodySmall, { color: onSurfaceVariant }]}>
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
  actionSection: {
    marginBottom: spacing.xxl,
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
