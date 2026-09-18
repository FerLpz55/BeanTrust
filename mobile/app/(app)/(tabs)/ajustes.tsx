/**
 * Ajustes — Perfil, finca y cierre de sesión (F06/F08).
 *
 * Datos reales: la identidad sale de `GET /v1/auth/me` (store de auth) y las
 * fincas de `GET /v1/fincas` (B15). El contrato de `/auth/me` no incluye el
 * nombre de la persona ni la fecha de alta, así que la UI no los inventa.
 */

import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { AyudaModal } from '@/src/components/ayuda-modal';
import { BrandMark } from '@/src/components/brand-mark';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { useAuthStore } from '@/src/store/auth';
import { useSyncStore } from '@/src/store/sync';
import { useLotesStore } from '@/src/store/lotes';
import { usePerfilStore } from '@/src/store/perfil';
import { useTemaStore, type PreferenciaTema } from '@/src/store/tema';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { radii, spacing, typeScale } from '@/src/theme/tokens';
import type { RegistroCola } from '@/src/offline/types';

const ETIQUETA_TEMA: Record<PreferenciaTema, string> = {
  automatico: 'Automático',
  claro: 'Claro',
  oscuro: 'Oscuro',
};

/** Etiqueta legible de una operación en cola, sin exponer detalles internos. */
function etiquetaOperacion(item: RegistroCola): string {
  const payload = item.payload;
  if (payload.tipo === 'registrar_cosecha') {
    return `Cosecha ${payload.id.slice(0, 8)}`;
  }
  if (payload.tipo === 'subir_evidencia') {
    return `Foto · lote ${payload.lote_id.slice(0, 8)}`;
  }
  return `Evento ${payload.evento.tipo} · lote ${payload.lote_id.slice(0, 8)}`;
}

export default function AjustesScreen() {
  const logout = useAuthStore((s) => s.logout);
  const email = useAuthStore((s) => s.email);
  const rol = useAuthStore((s) => s.rol);
  const usuarioId = useAuthStore((s) => s.usuarioId);
  const {
    isOnline,
    sincronizando,
    pendientes,
    conflictos,
    ultimoIntento,
    error: errorSync,
    sincronizarAhora,
    reintentar,
    descartar,
    limpiar,
  } = useSyncStore();
  const fincas = usePerfilStore((s) => s.fincas);
  const cargarFincas = usePerfilStore((s) => s.cargarFincas);
  const lotes = useLotesStore((s) => s.lotes);
  const preferenciaTema = useTemaStore((s) => s.preferencia);
  const cargarPreferenciaTema = useTemaStore((s) => s.cargarPreferencia);
  const ciclarPreferenciaTema = useTemaStore((s) => s.ciclarPreferencia);
  const [ayudaVisible, setAyudaVisible] = useState(false);

  useEffect(() => {
    void cargarFincas();
  }, [cargarFincas]);

  useEffect(() => {
    void cargarPreferenciaTema();
  }, [cargarPreferenciaTema]);

  // Estadísticas derivadas de los lotes reales ya cargados.
  const lotesTotales = lotes.length;
  const certificadosEmitidos = lotes.filter((l) => l.certificado).length;
  const finca = fincas[0] ?? null;

  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const surfaceContainerLow = useThemeColor('surfaceContainerLow');
  const surfaceContainer = useThemeColor('surfaceContainer');
  const outlineVariant = useThemeColor('outlineVariant');
  const primary = useThemeColor('primary');
  const error = useThemeColor('error');
  const primaryContainer = useThemeColor('primaryContainer');
  const onPrimaryContainer = useThemeColor('onPrimaryContainer');
  const secondaryContainer = useThemeColor('secondaryContainer');
  const onSecondaryContainer = useThemeColor('onSecondaryContainer');
  const tertiaryContainer = useThemeColor('tertiaryContainer');
  const onTertiaryContainer = useThemeColor('onTertiaryContainer');
  const surfaceContainerHigh = useThemeColor('surfaceContainerHigh');

  const cerrarSesion = useCallback(async () => {
    // Al salir se borran caché y cola del usuario: otro usuario no debe verlas.
    if (usuarioId) await limpiar(usuarioId);
    await logout();
    router.replace('/login');
  }, [logout, limpiar, usuarioId]);

  const operacionesPendientes = pendientes.length + conflictos.length;

  const handleLogout = useCallback(async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    if (operacionesPendientes > 0) {
      // Nunca se descarta trabajo offline en silencio: se avisa cuánto se pierde.
      Alert.alert(
        'Operaciones sin sincronizar',
        `Tienes ${operacionesPendientes} operación(es) pendiente(s). Si cierras sesión ahora se perderán.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Sincronizar ahora', onPress: () => void sincronizarAhora() },
          {
            text: `Salir y perder ${operacionesPendientes}`,
            style: 'destructive',
            onPress: () => void cerrarSesion(),
          },
        ],
      );
      return;
    }
    await cerrarSesion();
  }, [operacionesPendientes, sincronizarAhora, cerrarSesion]);

  const confirmarDescarte = useCallback(
    (sequence: number) => {
      Alert.alert(
        'Descartar operación',
        'Se eliminará de la cola local y no se enviará al backend. Esta acción no se puede deshacer.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Descartar', style: 'destructive', onPress: () => void descartar(sequence) },
        ],
      );
    },
    [descartar],
  );

  const getRoleColors = (rol: string) => {
    switch (rol) {
      case 'productor':
        return { bg: primaryContainer, text: onPrimaryContainer };
      case 'cooperativa':
        return { bg: secondaryContainer, text: onSecondaryContainer };
      case 'comprador':
        return { bg: tertiaryContainer, text: onTertiaryContainer };
      case 'admin':
      default:
        return { bg: surfaceContainerHigh, text: onSurface };
    }
  };

  const roleColors = getRoleColors(rol ?? '');

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: useThemeColor('background') }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <BrandMark size={40} />
            <View style={styles.headerText}>
              <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }]}>AJUSTES</Text>
              <Text style={[typeScale.headlineMedium, { color: onSurface }]}>Tu perfil</Text>
            </View>
          </View>
        </View>

        {/* Profile Card */}
        <View style={[styles.profileCard, { backgroundColor: surfaceContainerLow, borderRadius: radii.large }]}>
          <View style={[styles.avatar, { backgroundColor: surfaceContainer }]}>
            <IconSymbol size={32} name="person" color={onSurfaceVariant} />
          </View>
          <View style={styles.profileInfo}>
            <Text
              style={[typeScale.titleLarge, { color: onSurface }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {email ?? 'Sesión activa'}
            </Text>
            {rol ? (
              <View style={styles.roleRow}>
                <View style={[styles.roleChip, { backgroundColor: roleColors.bg }]}>
                  <Text style={[typeScale.labelMedium, { color: roleColors.text }]}>
                    {rol.charAt(0).toUpperCase() + rol.slice(1)}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        </View>

        {/* Finca Section */}
        {finca && (
          <View style={styles.section}>
            <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }, styles.sectionTitle]}>
              MI FINCA
            </Text>
            <View
              style={[
                styles.card,
                { backgroundColor: surfaceContainerLow, borderRadius: radii.large },
              ]}
            >
              <View style={styles.cardHeader}>
                <IconSymbol size={24} name="landscape" color={onSurfaceVariant} />
                <Text style={[typeScale.titleMedium, { color: onSurface }]}>{finca.nombre}</Text>
              </View>
              <View style={styles.fincaDetailRow}>
                <IconSymbol size={20} name="location-on" color={onSurfaceVariant} />
                <Text style={[typeScale.bodyMedium, { color: onSurfaceVariant }]}>
                  {finca.municipio}
                </Text>
              </View>
              {finca.altitud_min !== null && finca.altitud_max !== null ? (
                <View style={styles.fincaDetailRow}>
                  <IconSymbol size={20} name="terrain" color={onSurfaceVariant} />
                  <Text style={[typeScale.bodyMedium, { color: onSurfaceVariant }]}>
                    {finca.altitud_min} - {finca.altitud_max} msnm
                  </Text>
                </View>
              ) : null}
              {finca.organica ? (
                <View style={styles.fincaDetailRow}>
                  <IconSymbol size={20} name="eco" color={onSurfaceVariant} />
                  <Text style={[typeScale.bodyMedium, { color: onSurfaceVariant }]}>
                    Producción orgánica
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        )}

        {/* Stats Section */}
        <View style={styles.section}>
          <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }, styles.sectionTitle]}>ACTIVIDAD</Text>
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: surfaceContainerLow, borderRadius: radii.medium }]}>
              <Text style={[typeScale.titleLarge, { color: onSurface }]}>{lotesTotales}</Text>
              <Text style={[typeScale.bodySmall, { color: onSurfaceVariant, textAlign: 'center' }]}>lotes registrados</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: surfaceContainerLow, borderRadius: radii.medium }]}>
              <Text style={[typeScale.titleLarge, { color: onSurface }]}>
                {certificadosEmitidos}
              </Text>
              <Text style={[typeScale.bodySmall, { color: onSurfaceVariant, textAlign: 'center' }]}>certificados</Text>
            </View>
          </View>
        </View>

        {/* Sync Section */}
        <View style={styles.section}>
          <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }, styles.sectionTitle]}>SINCRONIZACIÓN</Text>
          <View style={[styles.card, { backgroundColor: surfaceContainerLow, borderRadius: radii.large }]}>
            <View style={styles.syncRow}>
              <View style={[styles.syncDot, { backgroundColor: isOnline ? primary : error }]} />
              <Text style={[typeScale.bodyMedium, { color: onSurface }]}>
                {isOnline ? 'En línea' : 'Sin conexión'}
              </Text>
            </View>
            <View style={styles.syncRow}>
              <Text style={[typeScale.bodyMedium, { color: onSurfaceVariant }]}>Último intento: </Text>
              <Text style={[typeScale.bodyMedium, { color: onSurface }]}>
                {ultimoIntento ? new Date(ultimoIntento).toLocaleTimeString('es-ES') : 'Nunca'}
              </Text>
            </View>

            {pendientes.length > 0 ? (
              <View style={styles.syncList}>
                {pendientes.map((item) => (
                  <View key={item.sequence} style={styles.syncItem}>
                    <IconSymbol size={18} name="cloud-upload" color={onSurfaceVariant} />
                    <Text style={[typeScale.bodySmall, styles.syncItemText, { color: onSurface }]} numberOfLines={1}>
                      {etiquetaOperacion(item)}
                    </Text>
                    <Text style={[typeScale.dataMono, { color: onSurfaceVariant }]}>
                      {item.attempts > 0 ? `${item.attempts} intento(s)` : 'pendiente'}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[styles.syncEmpty, { color: onSurfaceVariant }]}>
                No hay operaciones pendientes.
              </Text>
            )}

            {conflictos.map((item) => (
              <View key={item.sequence} style={[styles.syncItem, styles.syncConflicto]}>
                <IconSymbol size={18} name="error-outline" color={error} />
                <View style={styles.syncItemText}>
                  <Text style={[typeScale.bodySmall, { color: onSurface }]} numberOfLines={1}>
                    {etiquetaOperacion(item)}
                  </Text>
                  {item.lastError ? (
                    <Text style={[typeScale.bodySmall, { color: onSurfaceVariant }]} numberOfLines={2}>
                      {item.lastError}
                    </Text>
                  ) : null}
                </View>
                <Pressable onPress={() => void reintentar(item.sequence)} accessibilityRole="button">
                  <Text style={[typeScale.labelMedium, { color: primary }]}>Reintentar</Text>
                </Pressable>
                <Pressable onPress={() => confirmarDescarte(item.sequence)} accessibilityRole="button">
                  <Text style={[typeScale.labelMedium, { color: error }]}>Descartar</Text>
                </Pressable>
              </View>
            ))}

            <Pressable
              onPress={() => void sincronizarAhora()}
              disabled={sincronizando}
              accessibilityRole="button"
              accessibilityState={{ disabled: sincronizando }}
              style={[
                styles.syncAction,
                { borderTopColor: outlineVariant, opacity: sincronizando ? 0.6 : 1 },
              ]}
            >
              <Text style={[typeScale.labelLarge, { color: primary }]}>
                {sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}
              </Text>
            </Pressable>

            {errorSync ? (
              <Text
                style={[typeScale.bodySmall, styles.syncError, { color: error }]}
                accessibilityLiveRegion="polite"
              >
                {errorSync}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Settings Menu */}
        <View style={styles.section}>
          <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }, styles.sectionTitle]}>PREFERENCIAS</Text>
          <View style={[styles.menu, { backgroundColor: surfaceContainerLow, borderRadius: radii.large }]}>
            <MenuItem icon="notifications" label="Notificaciones" rightText="Próximamente" disabled />
            <View style={[styles.divider, { backgroundColor: outlineVariant }]} />
            <MenuItem
              icon="dark-mode"
              label="Modo oscuro"
              rightText={ETIQUETA_TEMA[preferenciaTema]}
              onPress={ciclarPreferenciaTema}
            />
            <View style={[styles.divider, { backgroundColor: outlineVariant }]} />
            <MenuItem icon="language" label="Idioma" rightText="Español (único disponible)" disabled />
            <View style={[styles.divider, { backgroundColor: outlineVariant }]} />
            <MenuItem icon="help-outline" label="Ayuda y soporte" onPress={() => setAyudaVisible(true)} />
          </View>
        </View>

        {/* Logout Button */}
        <Pressable onPress={handleLogout} style={({ pressed }) => [styles.logoutButton, { opacity: pressed ? 0.85 : 1 }]}>
          <IconSymbol size={24} name="logout" color={error} />
          <Text style={[typeScale.labelLarge, { color: error }]}>Cerrar sesión</Text>
        </Pressable>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={[typeScale.bodySmall, { color: onSurfaceVariant, textAlign: 'center' }]}>BeanTrust v1.0.0</Text>
          <Text style={[typeScale.bodySmall, { color: onSurfaceVariant, textAlign: 'center' }]}>Trazabilidad inmutable del café</Text>
        </View>
      </ScrollView>

      <AyudaModal visible={ayudaVisible} onClose={() => setAyudaVisible(false)} />
    </SafeAreaView>
  );
}

function MenuItem({
  icon,
  label,
  rightText,
  onPress,
  disabled = false,
}: {
  icon: string;
  label: string;
  rightText?: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  return (
    <Pressable
      onPress={() => {
        if (disabled || !onPress) return;
        Haptics.selectionAsync();
        onPress();
      }}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || !onPress }}
      style={({ pressed }) => [styles.menuItem, { opacity: pressed && !disabled ? 0.85 : disabled ? 0.5 : 1 }]}
    >
      <View style={styles.menuItemLeft}>
        <IconSymbol size={24} name={icon} color={onSurfaceVariant} />
        <Text style={[typeScale.bodyLarge, { color: onSurface }]}>{label}</Text>
      </View>
      <View style={styles.menuItemRight}>
        {rightText && <Text style={[typeScale.bodySmall, { color: onSurfaceVariant }]}>{rightText}</Text>}
        {!disabled ? <IconSymbol size={24} name="chevron-right" color={onSurfaceVariant} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  header: {
    paddingBottom: spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerText: {
    gap: spacing.xs,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  profileInfo: {
    flex: 1,
    gap: 2,
  },
  roleRow: {
    flexDirection: 'row',
    marginVertical: spacing.xs,
  },
  roleChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    marginLeft: spacing.xs,
  },
  card: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  fincaDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  syncDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  syncAction: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  syncList: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  syncItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  syncItemText: {
    flex: 1,
  },
  syncConflicto: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#00000022',
    paddingVertical: spacing.sm,
  },
  syncEmpty: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  syncError: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  menu: {
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    minHeight: 48,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  menuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 56, // Align with text
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
  appInfo: {
    alignItems: 'center',
    gap: 2,
    marginTop: spacing.md,
  },
});
