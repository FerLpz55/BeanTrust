import React, { useEffect } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandMark } from '@/src/components/brand-mark';
import { DonutChart } from '@/src/components/donut-chart';
import { EmptyState } from '@/src/components/empty-state';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { PrimaryButton } from '@/src/components/primary-button';
import { QrCodeLote } from '@/src/components/qr-code-lote';
import { StatusChip } from '@/src/components/status-chip';
import { TrazaTimeline } from '@/src/components/traza-timeline';
import { VerifiedSeal } from '@/src/components/verified-seal';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { spacing, typeScale, radii } from '@/src/theme/tokens';
import { useVerificarStore } from '@/src/store/verificar';
import { useAuthStore } from '@/src/store/auth';
import { LoteEstado } from '@/src/store/lotes';
import type { AnclajeOnchain } from '@/src/api/types';
import { useLocalSearchParams, router, type Href } from 'expo-router';

interface LocalParams {
  codigo: string;
}

/** Estado del anclaje del Pasaporte en la cadena (ADR-11). */
function AnclajeCard({ anclaje }: { anclaje: AnclajeOnchain | null }) {
  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const primary = useThemeColor('primary');
  const tertiary = useThemeColor('tertiary');
  const surfaceContainerLow = useThemeColor('surfaceContainerLow');

  const confirmada = anclaje?.estado === 'CONFIRMADA';
  const enEspera = anclaje?.estado === 'PENDIENTE' || anclaje?.estado === 'ENVIANDO' || anclaje?.estado === 'ENVIADA';
  const enlaceValido =
    confirmada && !!anclaje?.tx_hash && !!anclaje?.bloque && !!anclaje?.explorer_url;

  const titulo =
    anclaje === null
      ? 'Sin evidencia on-chain'
      : confirmada
        ? `Anclado en ${anclaje.red_nombre}`
        : anclaje.estado === 'FALLIDA'
          ? 'El Pasaporte sigue siendo válido'
          : 'Anclaje en curso';

  const detalle =
    anclaje === null
      ? 'Este Pasaporte se verifica off-chain; la evidencia en la cadena no está activa.'
      : confirmada
        ? 'La raíz SHA-256 quedó registrada de forma inmutable en la cadena.'
        : anclaje.estado === 'FALLIDA'
          ? 'Evidencia on-chain pendiente de revisión; el Pasaporte conserva su validez.'
          : 'El certificado ya es válido; la confirmación en la cadena puede tardar.';

  return (
    <View style={[styles.sectionCard, { backgroundColor: surfaceContainerLow }]}>
      <View style={styles.sectionHeader}>
        <Text style={[typeScale.labelLarge, { color: onSurface }]}>EVIDENCIA ON-CHAIN</Text>
        {anclaje ? (
          <View style={[styles.pill, { backgroundColor: surfaceContainerLow }]}>
            <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }]}>{anclaje.estado}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.anchorRow}>
        {enEspera ? (
          <ActivityIndicator size="small" color={primary} />
        ) : (
          <IconSymbol
            size={20}
            name={confirmada ? 'verified' : 'link'}
            color={confirmada ? tertiary : onSurfaceVariant}
          />
        )}
        <Text style={[typeScale.bodyMedium, { color: onSurface, flex: 1 }]}>{titulo}</Text>
      </View>
      <Text style={[typeScale.bodySmall, { color: onSurfaceVariant }, styles.anchorDetail]}>
        {detalle}
      </Text>
      {enlaceValido ? (
        <>
          <Text style={[typeScale.dataMono, { color: onSurfaceVariant }]}>
            {(anclaje?.tx_hash ?? '').slice(0, 18)}...
          </Text>
          <PrimaryButton
            label={`Ver en ${anclaje?.explorer_etiqueta}`}
            onPress={() => Linking.openURL(anclaje?.explorer_url as string)}
            style={styles.anchorButton}
          />
        </>
      ) : null}
    </View>
  );
}

export default function VerificarCodigoScreen() {
  const params = useLocalSearchParams() as unknown as LocalParams;
  const { data, isLoading, error, buscarPorCodigo, reset } = useVerificarStore();
  const rol = useAuthStore((s) => s.rol);

  const background = useThemeColor('background');
  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const primary = useThemeColor('primary');
  const primaryContainer = useThemeColor('primaryContainer');
  const onPrimaryContainer = useThemeColor('onPrimaryContainer');
  const surfaceContainerLow = useThemeColor('surfaceContainerLow');
  const tertiary = useThemeColor('tertiary');
  const tertiaryContainer = useThemeColor('tertiaryContainer');
  const onTertiaryContainer = useThemeColor('onTertiaryContainer');
  
  useEffect(() => {
    if (params.codigo) {
      buscarPorCodigo(params.codigo);
    }
    return () => reset();
  }, [params.codigo, buscarPorCodigo, reset]);

  if (isLoading || (!data && !error)) {
    return (
      <SafeAreaView style={[styles.loadingRoot, { backgroundColor: background }]}>
        <View style={styles.loadingContent}>
          <BrandMark size={48} />
          <ActivityIndicator size="large" color={primary} style={{ marginTop: spacing.lg }} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !data) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: background }]}>
        <EmptyState
          title="Lote no encontrado"
          description={error || "El código escaneado no corresponde a ningún lote registrado."}
          iconName="close"
          actionLabel="Volver al escáner"
          onAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  // `pasaporte` es el `VerificarRead` del backend; `timeline` ya viene
  // proyectado sobre la cadena canónica de 11 etapas.
  const { pasaporte: lote, timeline } = data;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: background }]} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Cabecera / Sello */}
        <View style={styles.headerSection}>
          <VerifiedSeal />
          <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }, styles.headerLabel]}>
            CAFÉ DE ESPECIALIDAD
          </Text>
          <Text style={[typeScale.headlineMedium, { color: onSurface }, styles.headerTitle]}>
            {lote.finca_nombre || 'Finca'}
          </Text>
          {lote.municipio ? (
            <Text style={[typeScale.bodyLarge, { color: onSurfaceVariant }]}>
              {lote.municipio}
            </Text>
          ) : null}
          <View style={styles.estadoRow}>
            <StatusChip estado={lote.estado as LoteEstado} />
            <View style={[styles.hashBadge, { backgroundColor: surfaceContainerLow }]}>
              <IconSymbol size={12} name="lock" color={onSurfaceVariant} />
              <Text style={[typeScale.dataMono, { color: onSurfaceVariant }]}>
                {lote.hash_sha256.slice(0, 12)}...
              </Text>
            </View>
          </View>
        </View>

        {/* Info principal: variedad, método, peso, fecha */}
        <View style={styles.infoGrid}>
          <View style={[styles.infoCard, { backgroundColor: surfaceContainerLow }]}>
            <IconSymbol size={24} name="eco" color={tertiary} />
            <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }]}>VARIEDAD</Text>
            <Text style={[typeScale.titleLarge, { color: onSurface }]}>{lote.variedad ?? '—'}</Text>
          </View>
          <View style={[styles.infoCard, { backgroundColor: surfaceContainerLow }]}>
            <IconSymbol size={24} name="water-drop" color={primary} />
            <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }]}>BENEFICIADO</Text>
            <Text style={[typeScale.titleLarge, { color: onSurface }]}>{lote.metodo_beneficiado ?? '—'}</Text>
          </View>
          <View style={[styles.infoCard, { backgroundColor: surfaceContainerLow }]}>
            <IconSymbol size={24} name="local-cafe" color={primary} />
            <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }]}>PESO</Text>
            <Text style={[typeScale.titleLarge, { color: onSurface }]}>{lote.peso_actual_kg.toFixed(1)} kg</Text>
          </View>
          <View style={[styles.infoCard, { backgroundColor: surfaceContainerLow }]}>
            <IconSymbol size={24} name="location-on" color={onSurfaceVariant} />
            <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }]}>COSECHA</Text>
            <Text style={[typeScale.titleLarge, { color: onSurface }]}>
              {new Date(lote.fecha_cosecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
            </Text>
          </View>
        </View>

        {/* Anclaje on-chain (ADR-11) */}
        <AnclajeCard anclaje={lote.anclaje_onchain} />

        {/* Commerce Justo donut */}
        <View style={[styles.sectionCard, { backgroundColor: surfaceContainerLow }]}>
          <View style={styles.sectionHeader}>
            <Text style={[typeScale.labelLarge, { color: onSurface }]}>COMERCIO JUSTO</Text>
            <View style={[styles.pill, { backgroundColor: primaryContainer }]}>
              <Text style={[typeScale.eyebrow, { color: onPrimaryContainer }]}>97% PRODUCTOR</Text>
            </View>
          </View>
          <View style={styles.donutWrapper}>
            <DonutChart percentage={97} size={160} strokeWidth={16} />
            <View style={styles.donutLegend}>
              <View style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: primary }]} />
                <Text style={[typeScale.bodyMedium, { color: onSurface }]}>Productor (97%)</Text>
              </View>
              <View style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: tertiary }]} />
                <Text style={[typeScale.bodyMedium, { color: onSurface }]}>Cooperativa (3%)</Text>
              </View>
            </View>
          </View>
          <View style={styles.comercioDetail}>
            <Text style={[typeScale.bodySmall, { color: onSurfaceVariant }]}>
              Cada compra reparte el 97% al productor y el 3% a la cooperativa. La cadena de
              hashes de arriba es lo que permite verificar que el historial no fue alterado.
            </Text>
          </View>
          {rol === 'comprador' && lote.estado === 'VENDIDO' ? (
            <PrimaryButton
              label="Dejar propina al productor"
              onPress={() => router.push(`/mercado/${lote.lote_id}` as Href)}
              style={styles.propinaBtn}
            />
          ) : null}
        </View>

        {/* Timeline trazabilidad */}
        <View style={styles.sectionCard}>
          <Text style={[typeScale.labelLarge, { color: onSurface }, styles.sectionTitle]}>
            TRAZABILIDAD INMUTABLE
          </Text>
          <Text style={[typeScale.bodySmall, { color: onSurfaceVariant }, styles.sectionSubtitle]}>
            Cada etapa genera un hash criptográfico que encadena la historia completa
          </Text>
          <TrazaTimeline events={timeline} />
        </View>

        {/* Certificado */}
        <View style={[styles.sectionCard, { backgroundColor: tertiaryContainer }]}>
          <View style={styles.certHeader}>
            <IconSymbol size={24} name="verified-user" color={tertiary} />
            <Text style={[typeScale.labelLarge, { color: onTertiaryContainer }]}>CERTIFICADO DE ORIGEN</Text>
          </View>
          <QrCodeLote codigo={lote.codigo} style={styles.certQr} />
          <View style={styles.certBody}>
            <Text style={[typeScale.eyebrow, { color: onTertiaryContainer }]}>CÓDIGO</Text>
            <Text style={[typeScale.dataMono, { color: onTertiaryContainer }, styles.certCode]}>
              {lote.codigo}
            </Text>
            <Text style={[typeScale.eyebrow, { color: onTertiaryContainer }, styles.certHashLabel]}>
              HASH SHA-256
            </Text>
            <Text style={[typeScale.dataMono, { color: onTertiaryContainer }, styles.certHash]}>
              {lote.hash_sha256}
            </Text>
            <Text style={[typeScale.eyebrow, { color: onTertiaryContainer }, styles.certDateLabel]}>
              EMITIDO
            </Text>
            <Text style={[typeScale.dataMono, { color: onTertiaryContainer }]}>
              {new Date(lote.emitido_en).toLocaleString('es-ES')}
            </Text>
          </View>
        </View>

        <View style={styles.footerNote}>
          <Text style={[typeScale.bodySmall, { color: onSurfaceVariant }]}>
            BeanTrust — Trazabilidad inmutable desde la finca hasta tu taza
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loadingRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContent: {
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  headerSection: {
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.xl,
  },
  headerLabel: {
    textAlign: 'center',
  },
  headerTitle: {
    textAlign: 'center',
  },
  estadoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  hashBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: spacing.sm,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  infoCard: {
    flex: 1,
    minWidth: '45%',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.medium,
  },
  sectionCard: {
    padding: spacing.lg,
    borderRadius: radii.large,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    marginBottom: spacing.xs,
  },
  anchorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  anchorDetail: {
    marginTop: spacing.xs,
  },
  anchorButton: {
    marginTop: spacing.md,
  },
  sectionSubtitle: {
    marginBottom: spacing.md,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
  },
  donutWrapper: {
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.md,
  },
  donutLegend: {
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: radii.full,
  },
  comercioDetail: {
    alignItems: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    textAlign: 'center',
  },
  propinaBtn: {
    marginTop: spacing.lg,
  },
  certHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  certQr: {
    marginBottom: spacing.lg,
  },
  certBody: {
    gap: spacing.xs,
  },
  certCode: {
    fontSize: 16,
    letterSpacing: 0.1,
  },
  certHashLabel: {
    marginTop: spacing.md,
  },
  certHash: {
    fontSize: 11,
  },
  certDateLabel: {
    marginTop: spacing.md,
  },
  footerNote: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    textAlign: 'center',
  },
});