import { Linking, Pressable, StyleSheet, View } from 'react-native';

import type { EventSummary } from '@/src/api/contracts';
import { colors, congestionColors, congestionLabels, radius, spacing } from '@/src/theme';
import { formatCheckedAt } from '@/src/ui/presentation';
import { Text } from './Themed';

export function EventCard({ event }: { event: EventSummary }) {
  const signal = congestionColors[event.congestionSignal];
  const openSource = async () => {
    if (!event.sourceUrl || !isHttpUrl(event.sourceUrl)) return;
    await Linking.openURL(event.sourceUrl);
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{event.title}</Text>
        <View style={[styles.badge, { backgroundColor: signal.background }]}>
          <Text style={[styles.badgeText, { color: signal.foreground }]}>
            {congestionLabels[event.congestionSignal]}
          </Text>
        </View>
      </View>
      <Text style={styles.meta}>{formatDateRange(event.startDate, event.endDate)}</Text>
      {event.venue || event.address ? (
        <Text style={styles.detail}>{event.venue ?? event.address}</Text>
      ) : null}
      {event.distanceToRouteMeters !== null ? (
        <Text style={styles.detail}>
          자동차 경로에서 약 {formatDistance(event.distanceToRouteMeters)}
        </Text>
      ) : event.distanceToDestinationMeters !== null ? (
        <Text style={styles.detail}>
          목적지에서 약 {formatDistance(event.distanceToDestinationMeters)}
        </Text>
      ) : (
        <Text style={styles.detail}>행사장 좌표를 확인할 수 없어 추가 확인이 필요합니다.</Text>
      )}
      <View style={styles.footer}>
        <View style={styles.sourceBlock}>
          <Text style={styles.source}>
            {event.sourceName} · {confidenceLabel(event.confidence)}
          </Text>
          <Text style={styles.checkedAt}>확인 시각 {formatCheckedAt(event.checkedAt)}</Text>
        </View>
        {event.sourceUrl && isHttpUrl(event.sourceUrl) ? (
          <Pressable accessibilityRole="link" onPress={openSource} style={styles.linkButton}>
            <Text style={styles.link}>공식 출처 열기</Text>
          </Pressable>
        ) : null}
      </View>
      {event.status !== 'confirmed' ? (
        <Text style={styles.status}>{statusLabel(event.status)}</Text>
      ) : null}
    </View>
  );
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function formatDateRange(start: string, end: string): string {
  return start === end ? start : `${start} ~ ${end}`;
}

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${meters}m`;
}

function confidenceLabel(value: EventSummary['confidence']): string {
  return { high: '신뢰도 높음', medium: '신뢰도 보통', low: '확인 필요' }[value];
}

function statusLabel(value: EventSummary['status']): string {
  return { candidate: '후보 행사', changed: '변경 가능', cancelled: '취소됨', confirmed: '확정' }[
    value
  ];
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.ink, lineHeight: 22 },
  badge: { borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 5 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  meta: { color: colors.primaryDark, fontWeight: '700', fontSize: 13 },
  detail: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sourceBlock: { flex: 1, gap: 2 },
  source: { color: colors.subtle, fontSize: 11 },
  checkedAt: { color: colors.subtle, fontSize: 10 },
  linkButton: { padding: spacing.xs },
  link: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  status: { color: colors.warning, fontSize: 12, fontWeight: '700' },
});
