/** Campo de texto con label fija visible, error inline, toggle de visibilidad
 * y reenvío de ref para encadenar el foco entre campos. */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { forwardRef, useId, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
} from 'react-native';

import { useThemeColor } from '@/src/hooks/use-theme-color';
import { radii, spacing, typeScale } from '@/src/theme/tokens';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string | null;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  testID?: string;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  {
    label,
    value,
    onChangeText,
    error,
    secureTextEntry = false,
    keyboardType,
    autoCapitalize,
    autoComplete,
    textContentType,
    returnKeyType,
    onSubmitEditing,
    onFocus,
    onBlur,
    testID,
  },
  ref
) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(secureTextEntry);
  // Único por instancia aunque no llegue `testID`: sin esto, dos campos sin
  // testID en la misma pantalla comparten `id` (HTML inválido) y el
  // `aria-labelledby` deja de apuntar a la etiqueta correcta.
  const generatedId = useId();
  const baseId = testID ?? generatedId;

  const outline = useThemeColor('outline');
  const outlineFocus = useThemeColor('primary');
  const errorColor = useThemeColor('error');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const onSurface = useThemeColor('onSurface');
  const labelColor = error ? errorColor : focused ? outlineFocus : onSurfaceVariant;

  const borderColor = error ? errorColor : focused ? outlineFocus : outline;

  return (
    <View style={styles.wrapper} testID={`${baseId}-wrap`}>
      <Text
        style={[typeScale.labelMedium, { color: labelColor }]}
        accessibilityLabel={label}
        nativeID={`${baseId}-label`}
      >
        {label}
      </Text>
      <View style={[styles.container, { borderColor }]}>
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => {
            setFocused(true);
            onFocus?.();
          }}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          placeholderTextColor={onSurfaceVariant}
          secureTextEntry={hidden}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          autoComplete={autoComplete}
          textContentType={textContentType}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          accessibilityLabel={error ? `${label}. ${error}` : label}
          accessibilityLabelledBy={`${baseId}-label`}
          testID={testID}
          style={[typeScale.bodyLarge, styles.input, { color: onSurface }]}
        />
        {secureTextEntry ? (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Mostrar contraseña' : 'Ocultar contraseña'}
            hitSlop={spacing.sm}
            style={styles.toggle}
          >
            <MaterialIcons
              name={hidden ? 'visibility' : 'visibility-off'}
              size={22}
              color={onSurfaceVariant}
            />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.helperSlot} accessibilityLiveRegion="polite">
        {error ? (
          <View style={styles.errorRow}>
            <MaterialIcons name="error-outline" size={16} color={errorColor} />
            <Text style={[typeScale.bodySmall, styles.helperText, { color: errorColor }]}>{error}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.sm,
  },
  container: {
    minHeight: 56,
    borderRadius: radii.medium,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: 'transparent',
  },
  input: {
    flex: 1,
    paddingVertical: spacing.lg,
    paddingLeft: 0,
    paddingRight: spacing.sm,
  },
  toggle: {
    padding: spacing.xs,
    marginLeft: spacing.sm,
  },
  helperSlot: {
    minHeight: 16,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  helperText: {
    flexShrink: 1,
  },
});