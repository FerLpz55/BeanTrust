/** Pasaporte de Café — verificación pública detallada (F03). */

import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BrandMark } from '@/src/components/brand-mark';
import { DonutChart } from '@/src/components/donut-chart';
import { EmptyState } from '@/src/components/empty-state';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { StatusChip } from '@/src/components/status-chip';
import { TrazaTimeline } from '@/src/components/traza-timeline';
import { VerifiedSeal } from '@/src/components/verified-seal';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { spacing, typeScale } from '@/src/theme/tokens';
import { useVerificarStore } from '@/src/store/verificar';
import { useLocalSearchParams } from 'expo-router';

interface LocalParams {
  codigo: string;
}

export default function VerificarCodigoScreen() {
  const params = useLocalSearchParams() as unknown as LocalParams;
  const { data, isLoading } = useVerificarStore();

  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const primary = useThemeColor('primary');
  const primaryContainer = useThemeColor('primaryContainer');
  const onPrimaryContainer = useThemeColor('onPrimaryContainer');
  const surfaceContainerLow = useThemeColor('surfaceContainerLow');
  const tertiary = useThemeColor('tertiary');
  const tertiaryContainer = useThemeColor('tertiaryContainer');
  const onTertiaryContainer = useThemeColor('onTertiaryContainer');

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingRoot}>
        <View style={styles.loadingContent}>
          <BrandMark size={48} />
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.root}>
        <EmptyState
          title="Lote no encontrado"
          description="El código escaneado no corresponde a ningún lote registrado."
          iconName="close"
          actionLabel="Escanear otro"
          onAction={() => {}}
        />
      </SafeAreaView>
    );
  }

  const { lote, historial } = data;

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header con sello verificado */}
        <View style={styles.headerSection}>
          <BrandMark size={48} />
          <VerifiedSeal />
          <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }, styles.headerLabel]}>
            PASAPORTE DE CAFÉ
          </Text>
          <Text style={[typeScale.headlineMedium, { color: onSurface }, styles.headerTitle]}>
            Lote {lote.codigo_publico}
          </Text>
          <View style={[styles.estadoRow, { gap: spacing.md }]}>
            <StatusChip estado={lote.estado} />
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
          <View style={styles.infoCard}>
            <IconSymbol size={24} name="eco" color={tertiary} />
            <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }]}>VARIEDAD</Text>
            <Text style={[typeScale.titleLarge, { color: onSurface }]}>{lote.variedad ?? '—'}</Text>
          </View>
          <View style={styles.infoCard}>
            <IconSymbol size={24} name="water_drop" color={primary} />
            <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }]}>BENEFICIADO</Text>
            <Text style={[typeScale.titleLarge, { color: onSurface }]}>{lote.metodo_beneficiado ?? '—'}</Text>
          </View>
          <View style={styles.infoCard}>
            <IconSymbol size={24} name="local_cafe" color={primary} />
            <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }]}>PESO</Text>
            <Text style={[typeScale.titleLarge, { color: onSurface }]}>{lote.peso_actual_kg.toFixed(1)} kg</Text>
          </View>
          <View style={styles.infoCard}>
            <IconSymbol size={24} name="location_on" color={onSurfaceVariant} />
            <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }]}>COSECHA</Text>
            <Text style={[typeScale.titleLarge, { color: onSurface }]}>
              {new Date(lote.fecha_cosecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
            </Text>
          </View>
        </View>

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
              Cada compra reparte el 97% al productor y 3% a la cooperativa. Verificado en blockchain.
            </Text>
          </View>
        </View>

        {/* Timeline trazabilidad */}
        <View style={styles.sectionCard}>
          <Text style={[typeScale.labelLarge, { color: onSurface }, styles.sectionTitle]}>
            TRAZABILIDAD INMUTABLE
          </Text>
          <Text style={[typeScale.bodySmall, { color: onSurfaceVariant }, styles.sectionSubtitle]}>
            Cada etapa genera un hash criptográfico que encadena la historia completa
          </Text>
          <TrazaTimeline events={historial} />
        </View>

        {/* Certificado */}
        <View style={[styles.sectionCard, { backgroundColor: tertiaryContainer }]}>
          <View style={styles.certHeader}>
            <IconSymbol size={24} name="verified_user" color={tertiary} />
            <Text style={[typeScale.labelLarge, { color: onTertiaryContainer }]}>CERTIFICADO DE ORIGEN</Text>
          </View>
          <View style={styles.certBody}>
            <Text style={[typeScale.eyebrow, { color: onTertiaryContainer }]}>CÓDIGO</Text>
            <Text style={[typeScale.dataMono, { color: onTertiaryContainer }, styles.certCode]}>
              {lote.codigo_publico}
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
    backgroundColor: '#F2E6D8',
    borderRadius: 12,
  },
  sectionCard: {
    padding: spacing.lg,
    borderRadius: 16,
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    marginBottom: spacing.xs,
  },
  sectionSubtitle: {
    marginBottom: spacing.md,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: spacing.full,
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
    borderRadius: 5,
  },
  comercioDetail: {
    alignItems: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
  certHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
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
  },
});