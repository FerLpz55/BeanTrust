/**
 * Design tokens de BeanTrust — "Copa de cata".
 *
 * Dirección propia, anclada al café de especialidad: espresso profundo +
 * crema dorada + la cereza madura del cafeto. La superficie lee "leche del
 * espresso" (no SaaS white, no papel genérico); la acción primaria es el
 * espresso tostado; el acento secundario es la crema dorada y el terciario,
 * la cereza (vino, no rojo de error). El sello de certificación estampa la
 * marca sobre la copa.
 *
 * Tipografía: Fraunces (display serif con carácter, usado con mesura para el
 * wordmark), Work Sans (cuerpo) e IBM Plex Mono (datos/registro: lotes,
 * códigos, eyebrows). El mono solo aparece en lo instrumental: así la
 * identidad lee "certificación", no "template".
 */

export const colors = {
  light: {
    // Espresso tostado: la acción primaria.
    primary: '#3A1D0C',
    onPrimary: '#F8EBDC',
    primaryContainer: '#F2CE9B',
    onPrimaryContainer: '#2C1404',
    // Crema dorada del espresso: acento para acciones secundarias (nunca errores).
    secondary: '#8A5A00',
    secondaryContainer: '#F5E3C4',
    onSecondaryContainer: '#2C1404',
    // Cereza madura del cafeto (vino, no rojo error).
    tertiary: '#8A2E3D',
    tertiaryContainer: '#F8D0D8',
    onTertiaryContainer: '#4A0A14',
    error: '#BA1A1A',
    errorContainer: '#FFDAD6',
    onErrorContainer: '#93000A',
    // Leche del espresso: superficie cálida.
    surface: '#F7EBDD',
    onSurface: '#2B1B12',
    surfaceContainerLowest: '#FDF5EA',
    surfaceContainerLow: '#F2E6D8',
    surfaceContainer: '#EDE0D1',
    surfaceContainerHigh: '#E7DACC',
    onSurfaceVariant: '#564839',
    outline: '#6F6050',
    outlineVariant: '#C3B4A2',
    background: '#F7EBDD',
  },
  dark: {
    primary: '#F2C48F',
    onPrimary: '#2E1605',
    primaryContainer: '#4A2D14',
    onPrimaryContainer: '#F2CE9B',
    secondary: '#E7A800',
    secondaryContainer: '#6E4300',
    onSecondaryContainer: '#F5E3C4',
    tertiary: '#DA8A98',
    tertiaryContainer: '#5A1E2A',
    onTertiaryContainer: '#F8D0D8',
    error: '#FFB4AB',
    errorContainer: '#93000A',
    onErrorContainer: '#FFDAD6',
    surface: '#21150F',
    onSurface: '#F8E7D7',
    surfaceContainerLowest: '#150C07',
    surfaceContainerLow: '#241811',
    surfaceContainer: '#2A1E17',
    surfaceContainerHigh: '#34261E',
    onSurfaceVariant: '#CFBFAC',
    outline: '#998A78',
    outlineVariant: '#514438',
    background: '#21150F',
  },
} as const;

export const fonts = {
  display: 'Fraunces_600SemiBold',
  displayBold: 'Fraunces_700Bold',
  body: 'WorkSans_400Regular',
  bodyMedium: 'WorkSans_500Medium',
  bodySemibold: 'WorkSans_600SemiBold',
  label: 'WorkSans_700Bold',
  mono: 'IBMPlexMono_500Medium',
  monoRegular: 'IBMPlexMono_400Regular',
} as const;

/** Grid 8pt: la proximidad es significado (espacio interno < entre componentes < entre secciones). */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  full: 9999,
} as const;

/** Escala de formas M3: no usar el mismo radio en todo. El sello es circular. */
export const radii = {
  medium: 12,
  large: 16,
  extraLarge: 28,
  full: 9999,
} as const;

/** Escala tipográfica M3 reducida a lo que usa la app, + roles de registro (mono). */
export const typeScale = {
  headlineMedium: { fontSize: 28, lineHeight: 36, letterSpacing: 0, fontFamily: fonts.display },
  titleLarge: { fontSize: 22, lineHeight: 28, letterSpacing: 0, fontFamily: fonts.bodySemibold },
  titleMedium: { fontSize: 16, lineHeight: 24, letterSpacing: 0.01, fontFamily: fonts.bodySemibold },
  bodyLarge: { fontSize: 16, lineHeight: 24, letterSpacing: 0.005, fontFamily: fonts.body },
  bodyMedium: { fontSize: 14, lineHeight: 20, letterSpacing: 0.02, fontFamily: fonts.body },
  bodySmall: { fontSize: 12, lineHeight: 16, letterSpacing: 0.03, fontFamily: fonts.body },
  labelLarge: { fontSize: 14, lineHeight: 20, letterSpacing: 0.01, fontFamily: fonts.label },
  labelMedium: { fontSize: 12, lineHeight: 16, letterSpacing: 0.03, fontFamily: fonts.bodySemibold },
  // Roles de "registro": el mono solo para lo instrumental (lotes, códigos, eyebrows).
  eyebrow: { fontSize: 11, lineHeight: 16, letterSpacing: 0.14, fontFamily: fonts.mono },
  dataMono: { fontSize: 13, lineHeight: 20, letterSpacing: 0.02, fontFamily: fonts.monoRegular },
} as const;