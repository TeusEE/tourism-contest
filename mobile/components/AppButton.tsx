import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type PressableProps,
  type ViewStyle,
} from 'react-native';

import { colors, radius, spacing } from '@/src/theme';
import { Text } from './Themed';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface AppButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
}

export function AppButton({
  label,
  variant = 'primary',
  loading = false,
  fullWidth = true,
  disabled,
  style,
  ...props
}: AppButtonProps) {
  const palette = buttonPalette[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        fullWidth && styles.fullWidth,
        { backgroundColor: palette.background, borderColor: palette.border },
        (disabled || loading) && styles.disabled,
        pressed && !disabled && !loading && styles.pressed,
        style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={palette.foreground} />
      ) : (
        <Text style={[styles.label, { color: palette.foreground }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const buttonPalette: Record<
  ButtonVariant,
  { background: string; foreground: string; border: string }
> = {
  primary: { background: colors.primary, foreground: colors.white, border: colors.primary },
  secondary: {
    background: colors.primarySoft,
    foreground: colors.primaryDark,
    border: colors.primarySoft,
  },
  ghost: { background: 'transparent', foreground: colors.primary, border: colors.line },
  danger: { background: colors.dangerSoft, foreground: colors.danger, border: colors.dangerSoft },
};

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  fullWidth: { width: '100%' },
  label: { fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
});
