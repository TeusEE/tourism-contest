import { StyleSheet, TextInput, type TextInputProps, View } from 'react-native';

import { colors, radius, spacing } from '@/src/theme';
import { Text } from './Themed';

interface AppTextInputProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
}

export function AppTextInput({ label, error, hint, style, ...props }: AppTextInputProps) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={props.accessibilityLabel ?? label}
        placeholderTextColor={colors.subtle}
        style={[styles.input, error && styles.inputError, style]}
        {...props}
      />
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.sm },
  label: { fontSize: 14, fontWeight: '700', color: colors.ink },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    color: colors.ink,
    backgroundColor: colors.surface,
    fontSize: 16,
  },
  inputError: { borderColor: colors.danger },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18 },
});
