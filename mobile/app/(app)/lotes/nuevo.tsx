/**
 * Wizard Registro de Lote — (F02) 3 pasos.
 */

import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useCallback, useEffect } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/src/components/primary-button';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { ApiError } from '@/src/api/client';
import { useLoteDraft } from '@/src/store/lote-draft';
import { useLotesStore } from '@/src/store/lotes';
import { usePerfilStore } from '@/src/store/perfil';
import { radii, spacing, typeScale } from '@/src/theme/tokens';

const VARIEDADES = ['Caturra', 'Bourbon', 'Geisha'];
const METODOS = ['Lavado', 'Semilavado', 'Honey', 'Natural'];

export default function NuevoLoteScreen() {
  const crear = useLotesStore((s) => s.crear);
  const fincas = usePerfilStore((s) => s.fincas);
  const cargarFincas = usePerfilStore((s) => s.cargarFincas);
  const {
    step,
    loteId,
    variedad,
    metodo_beneficiado,
    peso_kg,
    fecha_cosecha,
    finca_id,
    enviando,
    error,
    setVariedad,
    setMetodo,
    setPeso,
    setFechaCosecha,
    setFinca,
    setEnviando,
    setError,
    nextStep,
    prevStep,
    reset,
    canAdvance,
  } = useLoteDraft();

  // `POST /v1/lotes` exige `finca_id`: se resuelve con `GET /v1/fincas` (B15).
  useEffect(() => {
    if (fincas.length === 0) void cargarFincas();
  }, [fincas.length, cargarFincas]);

  // Con una sola finca no tiene sentido pedir que la elija.
  useEffect(() => {
    if (finca_id === null && fincas.length === 1) setFinca(fincas[0].id);
  }, [finca_id, fincas, setFinca]);

  // Colors
  const background = useThemeColor('background');
  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const primary = useThemeColor('primary');
  const onPrimary = useThemeColor('onPrimary');
  const primaryContainer = useThemeColor('primaryContainer');
  const surfaceContainerLow = useThemeColor('surfaceContainerLow');
  const outlineVariant = useThemeColor('outlineVariant');
  const secondary = useThemeColor('secondary');
  const errorColor = useThemeColor('error');

  const handleClose = useCallback(() => {
    reset();
    router.back();
  }, [reset]);

  const handleBack = useCallback(() => {
    if (step === 1) {
      handleClose();
    } else {
      Haptics.selectionAsync();
      prevStep();
    }
  }, [step, handleClose, prevStep]);

  const handleNext = useCallback(async () => {
    if (!canAdvance() || enviando) return;
    Haptics.selectionAsync();

    if (step !== 3) {
      nextStep();
      return;
    }

    setEnviando(true);
    setError(null);
    try {
      // `id` va en el cuerpo (no en un header): reusarlo hace el alta idempotente.
      await crear({
        id: loteId,
        finca_id: finca_id!,
        fecha_cosecha,
        peso_kg: peso_kg!,
        variedad,
        metodo_beneficiado,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      nextStep();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo registrar el lote. Reintenta.');
    } finally {
      setEnviando(false);
    }
  }, [
    step,
    canAdvance,
    enviando,
    crear,
    loteId,
    finca_id,
    fecha_cosecha,
    peso_kg,
    variedad,
    metodo_beneficiado,
    nextStep,
    setEnviando,
    setError,
  ]);

  // Render Success State
  if (step === 'success') {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: background }]}>
        <View style={styles.successContainer}>
          <IconSymbol name="check_circle" size={100} color={secondary} />
          <Text style={[typeScale.headlineMedium, { color: onSurface, marginTop: spacing.xl }]}>
            Lote registrado
          </Text>
          <Text style={[typeScale.bodyMedium, { color: onSurfaceVariant, marginTop: spacing.sm, textAlign: 'center' }]}>
            Tu cosecha ha sido registrada exitosamente
          </Text>
        </View>
        <View style={styles.footer}>
          <PrimaryButton
            label="Volver al Dashboard"
            onPress={handleClose}
            style={styles.fullWidthBtn}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: background }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={[typeScale.titleLarge, { color: onSurface, flex: 1 }]}>
            Registrar Nuevo Lote
          </Text>
          <Pressable onPress={handleClose} accessibilityRole="button" style={styles.closeBtn}>
            <IconSymbol name="close" size={28} color={onSurfaceVariant} />
          </Pressable>
        </View>
        <View style={styles.stepperContainer}>
          {[1, 2, 3].map((s) => {
            const isActive = s === step;
            const isCompleted = typeof step === 'number' && s < step;
            const bgColor = isActive || isCompleted ? primary : outlineVariant;
            return <View key={s} style={[styles.stepBar, { backgroundColor: bgColor }]} />;
          })}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {step === 1 && (
          <View style={styles.stepContainer}>
            <Text style={[typeScale.eyebrow, { color: onSurfaceVariant, marginBottom: spacing.md }]}>
              VARIEDAD
            </Text>
            <View style={styles.cardsRow}>
              {VARIEDADES.map((v) => {
                const isSelected = variedad === v;
                return (
                  <Pressable
                    key={v}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setVariedad(v);
                    }}
                    style={({ pressed }) => [
                      styles.variedadCard,
                      {
                        backgroundColor: isSelected ? primaryContainer : surfaceContainerLow,
                        borderColor: isSelected ? primary : 'transparent',
                        opacity: pressed ? 0.85 : 1,
                      }
                    ]}
                  >
                    <IconSymbol name="eco" size={28} color={isSelected ? primary : onSurfaceVariant} />
                    <Text style={[typeScale.labelLarge, { color: isSelected ? primary : onSurface, marginTop: spacing.sm, textAlign: 'center' }]}>
                      {v}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[typeScale.eyebrow, { color: onSurfaceVariant, marginTop: spacing.xl, marginBottom: spacing.md }]}>
              MÉTODO DE BENEFICIADO
            </Text>
            <View style={styles.chipsContainer}>
              {METODOS.map((m) => {
                const isSelected = metodo_beneficiado === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setMetodo(m);
                    }}
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        backgroundColor: isSelected ? primary : surfaceContainerLow,
                        opacity: pressed ? 0.85 : 1,
                      }
                    ]}
                  >
                    <Text style={[typeScale.labelLarge, { color: isSelected ? onPrimary : onSurfaceVariant }]}>
                      {m}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text
              style={[
                typeScale.eyebrow,
                { color: onSurfaceVariant, marginTop: spacing.xl, marginBottom: spacing.md },
              ]}
            >
              FECHA DE COSECHA
            </Text>
            <TextInput
              style={[
                typeScale.bodyLarge,
                styles.fechaInput,
                { color: onSurface, backgroundColor: surfaceContainerLow },
              ]}
              value={fecha_cosecha}
              onChangeText={setFechaCosecha}
              placeholder="AAAA-MM-DD"
              placeholderTextColor={onSurfaceVariant}
              autoCapitalize="none"
              accessibilityLabel="Fecha de cosecha"
            />
          </View>
        )}

        {step === 2 && (
          <View style={styles.stepContainer}>
            <View style={styles.pesoContainer}>
              <View style={[styles.pesoInputWrapper, { borderBottomColor: primary }]}>
                <TextInput
                  style={[typeScale.headlineMedium, { color: onSurface, textAlign: 'center', minWidth: 80 }]}
                  keyboardType="decimal-pad"
                  value={peso_kg ? String(peso_kg) : ''}
                  onChangeText={(val) => {
                    if (!val) {
                      setPeso(0);
                      return;
                    }
                    const parsed = parseFloat(val.replace(',', '.'));
                    setPeso(isNaN(parsed) ? 0 : parsed);
                  }}
                  placeholder="0"
                  placeholderTextColor={onSurfaceVariant}
                  autoFocus
                />
                <Text style={[typeScale.titleLarge, { color: onSurfaceVariant, marginLeft: spacing.xs }]}>kg</Text>
              </View>
              <Text style={[typeScale.bodyMedium, { color: onSurfaceVariant, marginTop: spacing.md, textAlign: 'center' }]}>
                Ingresa el peso en kilogramos
              </Text>
            </View>
          </View>
        )}

        {step === 3 && (
          <View style={styles.stepContainer}>
            <Text style={[typeScale.eyebrow, { color: onSurfaceVariant, marginBottom: spacing.md }]}>
              FINCA DE ORIGEN
            </Text>
            {fincas.length === 0 ? (
              <Text style={[typeScale.bodyMedium, { color: onSurfaceVariant }]}>
                No tienes fincas asignadas todavia. Pide a tu cooperativa que registre una para
                poder dar de alta lotes.
              </Text>
            ) : (
              <View style={styles.chipsContainer}>
                {fincas.map((f) => {
                  const isSelected = finca_id === f.id;
                  return (
                    <Pressable
                      key={f.id}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setFinca(f.id);
                      }}
                      style={({ pressed }) => [
                        styles.chip,
                        {
                          backgroundColor: isSelected ? primary : surfaceContainerLow,
                          opacity: pressed ? 0.85 : 1,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          typeScale.labelLarge,
                          { color: isSelected ? onPrimary : onSurfaceVariant },
                        ]}
                      >
                        {f.nombre}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <Text style={[typeScale.bodySmall, { color: onSurfaceVariant, marginTop: spacing.xl }]}>
              La foto de evidencia llega con el almacenamiento real (ADR-14, B11).
            </Text>

            {error ? (
              <Text
                style={[typeScale.bodySmall, { color: errorColor, marginTop: spacing.md }]}
                accessibilityLiveRegion="polite"
              >
                {error}
              </Text>
            ) : null}
          </View>
        )}

      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.footerButtons}>
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [
              styles.backBtn,
              {
                backgroundColor: surfaceContainerLow,
                opacity: pressed ? 0.85 : 1,
              }
            ]}
            accessibilityRole="button"
          >
            <Text style={[typeScale.labelLarge, { color: onSurface }]}>Atrás</Text>
          </Pressable>
          
          <View style={styles.nextBtnContainer}>
            <PrimaryButton
              label={step === 3 ? 'Guardar lote' : 'Siguiente'}
              loadingLabel="Guardando..."
              loading={enviando}
              onPress={handleNext}
              disabled={!canAdvance()}
            />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fechaInput: {
    borderRadius: radii.medium,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  root: { flex: 1 },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  closeBtn: {
    padding: spacing.xs,
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -12, // Offset for touch target padding
  },
  stepperContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stepBar: {
    flex: 1,
    height: 4,
    borderRadius: radii.full,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.md,
  },
  stepContainer: {
    flex: 1,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  variedadCard: {
    flex: 1,
    minHeight: 80,
    borderRadius: radii.medium,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderRadius: radii.full,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pesoContainer: {
    alignItems: 'center',
    marginTop: spacing.xxl,
  },
  pesoInputWrapper: {
    flexDirection: 'row',
    alignItems: 'baseline',
    borderBottomWidth: 2,
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing.xl,
  },
  evidenceBox: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: radii.large,
    minHeight: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    padding: spacing.xl,
  },
  footerButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  backBtn: {
    minHeight: 56,
    borderRadius: radii.large,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  nextBtnContainer: {
    flex: 1,
  },
  fullWidthBtn: {
    width: '100%',
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
});
