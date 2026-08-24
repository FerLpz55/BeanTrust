/**
 * Wizard Registro de Lote — (F02) 3 pasos.
 */

import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useCallback } from 'react';
import {
  Alert,
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
import { useLoteDraft } from '@/src/store/lote-draft';
import { useLotesStore } from '@/src/store/lotes';
import { radii, spacing, typeScale } from '@/src/theme/tokens';

const VARIEDADES = ['Caturra', 'Bourbon', 'Geisha'];
const METODOS = ['Lavado', 'Semilavado', 'Honey', 'Natural'];

export default function NuevoLoteScreen() {
  const addLote = useLotesStore((s) => s.addLote);
  const {
    step,
    variedad,
    metodo_beneficiado,
    peso_kg,
    evidencia_url,
    setVariedad,
    setMetodo,
    setPeso,
    nextStep,
    prevStep,
    reset,
    canAdvance,
  } = useLoteDraft();

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

  const handleNext = useCallback(() => {
    if (!canAdvance()) return;
    Haptics.selectionAsync();
    
    if (step === 3) {
      // Guardar lote
      addLote({
        variedad: variedad!,
        metodo: metodo_beneficiado!,
        peso_actual_kg: peso_kg!,
        evidencia: evidencia_url ? [evidencia_url] : [],
      });
      nextStep(); // moves to 'success'
    } else {
      nextStep();
    }
  }, [step, canAdvance, addLote, variedad, metodo_beneficiado, peso_kg, evidencia_url, nextStep]);

  const handleCajaEvidencia = () => {
    Alert.alert('Aviso', 'Cámara no disponible en demo');
  };

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
            <Pressable
              onPress={handleCajaEvidencia}
              style={({ pressed }) => [
                styles.evidenceBox,
                {
                  backgroundColor: surfaceContainerLow,
                  borderColor: outlineVariant,
                  opacity: pressed ? 0.85 : 1,
                }
              ]}
            >
              <IconSymbol name="photo_camera" size={32} color={onSurfaceVariant} />
              <Text style={[typeScale.bodyLarge, { color: onSurfaceVariant, marginTop: spacing.md }]}>
                Tomar foto de evidencia
              </Text>
            </Pressable>
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
