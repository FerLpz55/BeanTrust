/** Ajustes — Perfil, tema y logout (F06). */

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback } from 'react';

import { BrandMark } from '@/src/components/brand-mark';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { useAuthStore } from '@/src/store/auth';
import { useSyncStore } from '@/src/store/sync';
import { usePerfilStore } from '@/src/store/perfil';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { radii, spacing, typeScale } from '@/src/theme/tokens';

export default function AjustesScreen() {
  const logout = useAuthStore((s) => s.logout);
  const { pendingCount, isOnline } = useSyncStore();
  const { perfil } = usePerfilStore();

  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const surfaceContainerLow = useThemeColor('surfaceContainerLow');
  const surfaceContainer = useThemeColor('surfaceContainer');
  const outlineVariant = useThemeColor('outlineVariant');
  const error = useThemeColor('error');
  const primaryContainer = useThemeColor('primaryContainer');
  const onPrimaryContainer = useThemeColor('onPrimaryContainer');
  const secondaryContainer = useThemeColor('secondaryContainer');
  const onSecondaryContainer = useThemeColor('onSecondaryContainer');
  const tertiaryContainer = useThemeColor('tertiaryContainer');
  const onTertiaryContainer = useThemeColor('onTertiaryContainer');
  const surfaceContainerHigh = useThemeColor('surfaceContainerHigh');

  const handleLogout = useCallback(async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await logout();
    router.replace('/login');
  }, [logout]);

  const handleForceSync = useCallback(() => {
    Haptics.selectionAsync();
  }, []);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  };

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

  const roleColors = getRoleColors(perfil.rol);

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
            <Text style={[typeScale.titleLarge, { color: onSurface }]} numberOfLines={1}>{perfil.nombre}</Text>
            <Text style={[typeScale.bodyMedium, { color: onSurfaceVariant }]} numberOfLines={1} ellipsizeMode="tail">
              {perfil.email}
            </Text>
            <View style={styles.roleRow}>
              <View style={[styles.roleChip, { backgroundColor: roleColors.bg }]}>
                <Text style={[typeScale.labelMedium, { color: roleColors.text }]}>
                  {perfil.rol.charAt(0).toUpperCase() + perfil.rol.slice(1)}
                </Text>
              </View>
            </View>
            <Text style={[typeScale.bodySmall, { color: onSurfaceVariant }]}>
              Miembro desde {formatDate(perfil.fecha_registro)}
            </Text>
          </View>
        </View>

        {/* Finca Section */}
        {perfil.finca && (
          <View style={styles.section}>
            <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }, styles.sectionTitle]}>MI FINCA</Text>
            <View style={[styles.card, { backgroundColor: surfaceContainerLow, borderRadius: radii.large }]}>
              <View style={styles.cardHeader}>
                <IconSymbol size={24} name="landscape" color={onSurfaceVariant} />
                <Text style={[typeScale.titleMedium, { color: onSurface }]}>{perfil.finca.nombre}</Text>
              </View>
              <View style={styles.fincaDetailRow}>
                <IconSymbol size={20} name="location-on" color={onSurfaceVariant} />
                <Text style={[typeScale.bodyMedium, { color: onSurfaceVariant }]}>
                  {perfil.finca.municipio}, {perfil.finca.departamento}
                </Text>
              </View>
              <View style={styles.fincaDetailRow}>
                <IconSymbol size={20} name="terrain" color={onSurfaceVariant} />
                <Text style={[typeScale.bodyMedium, { color: onSurfaceVariant }]}>
                  {perfil.finca.altitud_min} - {perfil.finca.altitud_max} msnm
                </Text>
              </View>
              <View style={styles.fincaDetailRow}>
                <IconSymbol size={20} name="crop-square" color={onSurfaceVariant} />
                <Text style={[typeScale.bodyMedium, { color: onSurfaceVariant }]}>
                  {perfil.finca.hectareas} hectáreas
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Stats Section */}
        <View style={styles.section}>
          <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }, styles.sectionTitle]}>ACTIVIDAD</Text>
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: surfaceContainerLow, borderRadius: radii.medium }]}>
              <Text style={[typeScale.titleLarge, { color: onSurface }]}>{perfil.lotes_totales}</Text>
              <Text style={[typeScale.bodySmall, { color: onSurfaceVariant, textAlign: 'center' }]}>lotes registrados</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: surfaceContainerLow, borderRadius: radii.medium }]}>
              <Text style={[typeScale.titleLarge, { color: onSurface }]}>{perfil.certificados_emitidos}</Text>
              <Text style={[typeScale.bodySmall, { color: onSurfaceVariant, textAlign: 'center' }]}>certificados</Text>
            </View>
          </View>
        </View>

        {/* Sync Section */}
        <View style={styles.section}>
          <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }, styles.sectionTitle]}>SINCRONIZACIÓN</Text>
          <View style={[styles.card, { backgroundColor: surfaceContainerLow, borderRadius: radii.large, padding: 0 }]}>
            <View style={styles.syncRow}>
              <View style={[styles.syncDot, { backgroundColor: isOnline ? '#4CAF50' : '#F44336' }]} />
              <Text style={[typeScale.bodyMedium, { color: onSurface }]}>{isOnline ? 'En línea' : 'Sin conexión'}</Text>
            </View>
            <View style={styles.syncRow}>
              <Text style={[typeScale.titleMedium, { color: onSurface }]}>{pendingCount}</Text>
              <Text style={[typeScale.bodyMedium, { color: onSurfaceVariant, marginLeft: spacing.xs }]}>pendientes</Text>
            </View>
            <Pressable
              onPress={handleForceSync}
              style={({ pressed }) => [styles.syncAction, { opacity: pressed ? 0.85 : 1, borderTopColor: outlineVariant }]}
            >
              <Text style={[typeScale.labelLarge, { color: onSurface }]}>Forzar sincronización</Text>
            </Pressable>
          </View>
        </View>

        {/* Settings Menu */}
        <View style={styles.section}>
          <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }, styles.sectionTitle]}>PREFERENCIAS</Text>
          <View style={[styles.menu, { backgroundColor: surfaceContainerLow, borderRadius: radii.large }]}>
            <MenuItem icon="notifications" label="Notificaciones" />
            <View style={[styles.divider, { backgroundColor: outlineVariant }]} />
            <MenuItem icon="dark-mode" label="Modo oscuro" rightText="Automático" />
            <View style={[styles.divider, { backgroundColor: outlineVariant }]} />
            <MenuItem icon="language" label="Idioma" rightText="Español" />
            <View style={[styles.divider, { backgroundColor: outlineVariant }]} />
            <MenuItem icon="help-outline" label="Ayuda y soporte" />
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
    </SafeAreaView>
  );
}

function MenuItem({ icon, label, rightText }: { icon: string; label: string; rightText?: string }) {
  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  return (
    <Pressable style={({ pressed }) => [styles.menuItem, { opacity: pressed ? 0.85 : 1 }]}>
      <View style={styles.menuItemLeft}>
        <IconSymbol size={24} name={icon} color={onSurfaceVariant} />
        <Text style={[typeScale.bodyLarge, { color: onSurface }]}>{label}</Text>
      </View>
      <View style={styles.menuItemRight}>
        {rightText && <Text style={[typeScale.bodySmall, { color: onSurfaceVariant }]}>{rightText}</Text>}
        <IconSymbol size={24} name="chevron-right" color={onSurfaceVariant} />
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
