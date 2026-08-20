/** Ajustes — Perfil, tema y logout (placeholder F06). */

import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BrandMark } from '@/src/components/brand-mark';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { useAuthStore } from '@/src/store/auth';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { spacing, typeScale } from '@/src/theme/tokens';
import { router } from 'expo-router';

export default function AjustesScreen() {
  const email = useAuthStore((s) => s.email);
  const logout = useAuthStore((s) => s.logout);

  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const surfaceContainerLow = useThemeColor('surfaceContainerLow');
  const error = useThemeColor('error');

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <SafeAreaView style={styles.root}>
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

        {/* Perfil card */}
        <View style={[styles.card, { backgroundColor: surfaceContainerLow }]}>
          <View style={styles.avatar}>
            <IconSymbol size={32} name="person" color={onSurfaceVariant} />
          </View>
          <View>
            <Text style={[typeScale.titleLarge, { color: onSurface }]}>Productor</Text>
            <Text style={[typeScale.bodyMedium, { color: onSurfaceVariant }]}>
              {email ?? 'Sin sesión'}
            </Text>
          </View>
        </View>

        {/* Opciones */}
        <View style={styles.section}>
          <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }, styles.sectionTitle]}>
            CUENTA
          </Text>
          <View style={[styles.menu, { backgroundColor: surfaceContainerLow }]}>
            <MenuItem icon="notifications" label="Notificaciones" />
            <MenuItem icon="language" label="Idioma" />
            <MenuItem icon="help_outline" label="Ayuda y soporte" />
          </View>
        </View>

        {/* Logout */}
        <Pressable onPress={handleLogout} style={styles.logoutButton}>
          <IconSymbol size={20} name="logout" color={error} />
          <Text style={[typeScale.labelLarge, { color: error }]}>Cerrar sesión</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function MenuItem({ icon, label }: { icon: string; label: string }) {
  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  return (
    <View style={styles.menuItem}>
      <View style={styles.menuItemLeft}>
        <IconSymbol size={20} name={icon} color={onSurfaceVariant} />
        <Text style={[typeScale.bodyLarge, { color: onSurface }]}>{label}</Text>
      </View>
      <IconSymbol size={20} name="chevron_right" color={onSurfaceVariant} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  header: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerText: {
    gap: spacing.xs,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    marginLeft: spacing.sm,
  },
  menu: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
});
