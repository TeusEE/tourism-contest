import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/src/theme';
import { Text } from './Themed';

type StatusTone = 'info' | 'success' | 'warning' | 'danger';

interface StatusCardProps {
  title: string;
  message: string;
  tone?: StatusTone;
  compact?: boolean;
}

export function StatusCard({ title, message, tone = 'info', compact = false }: StatusCardProps) {
  const palette = tonePalette[tone];
  return (
    <View style={[styles.card, { backgroundColor: palette.background }, compact && styles.compact]}>
      <View style={[styles.dot, { backgroundColor: palette.foreground }]} />
      <View style={styles.copy}>
        <Text style={[styles.title, { color: palette.foreground }]}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
}

const tonePalette: Record<StatusTone, { foreground: string; background: string }> = {
  info: { foreground: colors.primaryDark, background: colors.primarySoft },
  success: { foreground: colors.success, background: colors.successSoft },
  warning: { foreground: colors.warning, background: colors.warningSoft },
  danger: { foreground: colors.danger, background: colors.dangerSoft },
};

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    padding: spacing.lg,
    flexDirection: 'row',
    gap: spacing.md,
  },
  compact: { padding: spacing.md },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  copy: { flex: 1, gap: spacing.xs },
  title: { fontSize: 14, fontWeight: '800' },
  message: { color: colors.ink, lineHeight: 20, fontSize: 14 },
});
