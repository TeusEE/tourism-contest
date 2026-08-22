import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { RouteMapPreview } from '@/components/RouteMapPreview';
import { StatusCard } from '@/components/StatusCard';
import { Text } from '@/components/Themed';
import type { VisitorReference, WeatherCondition, WeatherSummary } from '@/src/api/contracts';
import { useAnalysis } from '@/src/state/analysis';
import { colors, congestionColors, congestionLabels, radius, spacing } from '@/src/theme';
import {
  apiErrorTitle,
  formatCheckedAt,
  visitorStatusLabel,
  warningTitle,
  weatherStatusLabel,
} from '@/src/ui/presentation';

const weatherConditionLabels: Record<WeatherCondition, string> = {
  clear: '맑음',
  'partly-cloudy': '구름 조금',
  cloudy: '흐림',
  rain: '비',
  snow: '눈',
  'rain-snow': '비 또는 눈',
  unknown: '확인 필요',
};

export default function ResultsScreen() {
  const router = useRouter();
  const { state, retry, cancel, reset } = useAnalysis();

  if (state.phase === 'loading') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingScreen}>
          <View style={styles.loadingIcon}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
          <Text style={styles.loadingTitle}>여행 주변을 살펴보고 있어요</Text>
          <Text style={styles.loadingText}>
            자동차 경로를 확인하고 행사·방문객·날씨 정보를 함께 조회하고 있습니다.
          </Text>
          {state.appState !== 'active' ? (
            <StatusCard
              compact
              message="앱이 백그라운드에 있어요. 돌아오면 분석 상태를 확인할 수 있습니다."
              title="분석은 계속 진행 중"
              tone="info"
            />
          ) : null}
          <AppButton label="분석 취소" variant="danger" onPress={cancel} />
        </View>
      </SafeAreaView>
    );
  }

  if (state.phase === 'error') {
    const message = state.error?.message ?? '입력 내용을 확인한 후 다시 시도해 주세요.';
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.errorScreen}>
          <Text style={styles.errorEyebrow}>ANALYSIS UNAVAILABLE</Text>
          <Text style={styles.errorTitle}>분석을 완료하지 못했어요</Text>
          <StatusCard
            message={message}
            title={apiErrorTitle(state.error?.code ?? null)}
            tone="danger"
          />
          <View style={styles.buttonGroup}>
            <AppButton label="다시 시도" onPress={() => void retry()} />
            <AppButton
              label="입력으로 돌아가기"
              variant="secondary"
              onPress={() => router.replace('/')}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (state.phase === 'cancelled') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.errorScreen}>
          <Text style={styles.errorTitle}>분석을 취소했어요</Text>
          <Text style={styles.errorDescription}>
            필요한 경우 입력 화면에서 다시 분석할 수 있습니다.
          </Text>
          <AppButton label="입력으로 돌아가기" onPress={() => router.replace('/')} />
        </View>
      </SafeAreaView>
    );
  }

  if (state.phase !== 'success' || !state.result) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.errorScreen}>
          <Text style={styles.errorTitle}>분석할 여행 계획이 없어요</Text>
          <AppButton label="여행 계획 입력하기" onPress={() => router.replace('/')} />
        </View>
      </SafeAreaView>
    );
  }

  const result = state.result;
  const congestion = congestionColors[result.congestion.level];
  const startNewPlan = () => {
    reset();
    router.replace('/');
  };

  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <ScrollView
        testID="results-scroll"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.resultHeader}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>ANALYSIS RESULT</Text>
            <Text style={styles.resultTitle}>{result.travelDate} 여행 참고 정보</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={startNewPlan} style={styles.newPlanButton}>
            <Text style={styles.newPlanText}>새 분석</Text>
          </Pressable>
        </View>

        <View style={[styles.congestionCard, { backgroundColor: congestion.background }]}>
          <View style={styles.congestionHeader}>
            <Text style={[styles.congestionLevel, { color: congestion.foreground }]}>
              목적지 주변 행사 밀집 가능성 {congestionLabels[result.congestion.level]}
            </Text>
            <Text style={[styles.notTraffic, { color: congestion.foreground }]}>
              행사 개수 기반 · 교통 지연 예측 아님
            </Text>
          </View>
          <Text style={styles.congestionSummary}>{result.congestion.summary}</Text>
          {result.congestion.reasons.slice(0, 3).map((reason) => (
            <Text key={reason} style={styles.reason}>
              • {reason}
            </Text>
          ))}
        </View>

        <View style={styles.section}>
          <RouteMapPreview events={result.events} route={result.route} />
        </View>

        <View style={styles.summaryGrid}>
          <SummaryMetric label="자동차 경로" value={formatDistance(result.route.distanceMeters)} />
          <SummaryMetric
            label="예상 이동시간"
            value={formatDuration(result.route.durationSeconds)}
          />
          <SummaryMetric
            label="목적지 주변 행사"
            value={formatEventCount(result.nearbyEventCount, result.nearbyEventCountIsCapped)}
          />
        </View>

        <Warnings warnings={result.warnings} />
        <View style={styles.section}>
          <SectionHeading
            title="목적지 주변 행사 밀집 가능성"
            trailing={formatEventCount(result.nearbyEventCount, result.nearbyEventCountIsCapped)}
          />
          <StatusCard
            message={
              result.nearbyEventCount === null
                ? '행사 제공자 응답이 없어 행사 개수와 밀집 가능성을 확인할 수 없습니다.'
                : '현재 단계에서는 행사 개수만 확인했습니다. 행사별 상세정보는 다음 단계에서 제공합니다.'
            }
            title={
              result.nearbyEventCount === null
                ? '행사 밀집 가능성 확인 필요'
                : `${formatEventCount(result.nearbyEventCount, result.nearbyEventCountIsCapped)} 후보 확인`
            }
            tone={result.nearbyEventCount === null ? 'warning' : 'info'}
          />
        </View>
        <VisitorCard reference={result.visitorReference} />
        <WeatherCard weather={result.weather} />
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerTitle}>데이터 안내</Text>
          <Text style={styles.disclaimerText}>
            행사 개수는 확인 시점의 공식 후보 데이터입니다. 행사별 상세정보는 후속 단계에서
            조회하며, 방문객 수는 과거 참고값으로 미래 방문객 수 예측이 아닙니다. 일부 제공자 장애
            시 확인 가능한 정보만 표시됩니다.
          </Text>
        </View>
        <AppButton label="새 여행 계획 분석하기" variant="secondary" onPress={startNewPlan} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function formatEventCount(count: number | null, isCapped: boolean): string {
  if (count === null) return '확인 필요';
  return isCapped ? `${count}개 이상` : `${count}개`;
}

function SectionHeading({ title, trailing }: { title: string; trailing?: string }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {trailing ? <Text style={styles.sectionTrailing}>{trailing}</Text> : null}
    </View>
  );
}

function Warnings({
  warnings,
}: {
  warnings: { code: string; message: string; severity: 'info' | 'warning' }[];
}) {
  if (warnings.length === 0) return null;
  return (
    <View style={styles.section}>
      <SectionHeading title="확인할 안내" />
      <View style={styles.list}>
        {warnings.map((warning) => (
          <StatusCard
            compact
            key={`${warning.code}-${warning.message}`}
            message={warning.message}
            title={warningTitle(warning.code)}
            tone={warning.severity === 'warning' ? 'warning' : 'info'}
          />
        ))}
      </View>
    </View>
  );
}

function VisitorCard({ reference }: { reference: VisitorReference | null }) {
  if (!reference)
    return (
      <StatusCard
        message="방문객 참고값을 반환하지 않았습니다."
        title="방문객 정보 없음"
        tone="info"
      />
    );
  const status = {
    available: { title: '방문객 참고값', tone: 'success' as const },
    'no-data': { title: '방문객 데이터 없음', tone: 'info' as const },
    failed: { title: '방문객 조회 실패', tone: 'warning' as const },
  }[reference.status];
  return (
    <View style={styles.section}>
      <SectionHeading title="방문객 참고값" />
      <View style={styles.dataCard}>
        <View style={styles.dataHeader}>
          <Text style={styles.dataTitle}>{status.title}</Text>
          <View
            style={[
              styles.smallBadge,
              {
                backgroundColor:
                  status.tone === 'success' ? colors.successSoft : colors.warningSoft,
              },
            ]}
          >
            <Text style={styles.smallBadgeText}>{visitorStatusLabel(reference.status)}</Text>
          </View>
        </View>
        <Text style={styles.dataValue}>
          {reference.visitorCount !== null ? `${reference.visitorCount.toLocaleString()}명` : '—'}
        </Text>
        {reference.concentrationRate !== null ? (
          <Text style={styles.dataMeta}>
            관광지 상대 집중률 {reference.concentrationRate.toFixed(1)}%
          </Text>
        ) : null}
        <Text style={styles.dataMeta}>
          기준일 {reference.referenceDate ?? '확인 불가'} · {reference.region ?? '지역 확인 불가'}
        </Text>
        <Text style={styles.dataNote}>{reference.note}</Text>
      </View>
    </View>
  );
}

function WeatherCard({ weather }: { weather: WeatherSummary }) {
  const status = {
    available: { title: '날씨 예보' },
    'not-yet-published': { title: '예보 미발표' },
    'no-data': { title: '날씨 데이터 없음' },
    failed: { title: '날씨 조회 실패' },
  }[weather.status];
  return (
    <View style={styles.section}>
      <SectionHeading title="여행지 날씨" />
      <View style={styles.dataCard}>
        <View style={styles.dataHeader}>
          <Text style={styles.dataTitle}>{status.title}</Text>
          <Text style={styles.dataMeta}>{weather.targetDate}</Text>
        </View>
        <Text style={styles.dataMeta}>확인 시각 {formatCheckedAt(weather.checkedAt)}</Text>
        <Text style={styles.weatherSummary}>
          {weather.summary ?? `${weatherStatusLabel(weather.status)} 상태입니다.`}
        </Text>
        {weather.forecasts.slice(0, 6).map((forecast) => (
          <View key={forecast.forecastAt} style={styles.forecastRow}>
            <Text style={styles.forecastTime}>{forecast.forecastAt.slice(11, 16)}</Text>
            <Text style={styles.forecastCondition}>
              {weatherConditionLabels[forecast.condition]}
            </Text>
            <Text style={styles.forecastTemp}>
              {forecast.temperatureC !== null ? `${forecast.temperatureC}°` : '—'}
            </Text>
            <Text style={styles.forecastRain}>
              강수{' '}
              {forecast.precipitationProbabilityPercent !== null
                ? `${forecast.precipitationProbabilityPercent}%`
                : '—'}
            </Text>
          </View>
        ))}
        <Text style={styles.dataNote}>{weather.note ?? '기상청 단기예보 기준입니다.'}</Text>
      </View>
    </View>
  );
}

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${meters}m`;
}
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}분`;
  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.xl },
  loadingScreen: { flex: 1, padding: spacing.xl, justifyContent: 'center', gap: spacing.lg },
  loadingIcon: {
    alignSelf: 'center',
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingTitle: { textAlign: 'center', color: colors.ink, fontSize: 24, fontWeight: '900' },
  loadingText: { textAlign: 'center', color: colors.muted, lineHeight: 22 },
  errorScreen: { flex: 1, padding: spacing.xl, justifyContent: 'center', gap: spacing.lg },
  errorEyebrow: { color: colors.danger, fontSize: 12, fontWeight: '900', letterSpacing: 1.4 },
  errorTitle: { color: colors.ink, fontSize: 26, lineHeight: 34, fontWeight: '900' },
  errorDescription: { color: colors.muted, lineHeight: 22 },
  buttonGroup: { gap: spacing.md },
  resultHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  headerCopy: { flex: 1, gap: spacing.xs },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.3 },
  resultTitle: { color: colors.ink, fontSize: 24, lineHeight: 31, fontWeight: '900' },
  newPlanButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  newPlanText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  congestionCard: { borderRadius: radius.lg, padding: spacing.xl, gap: spacing.sm },
  congestionHeader: {
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  congestionLevel: { fontSize: 18, fontWeight: '900' },
  notTraffic: { fontSize: 10, fontWeight: '800' },
  congestionSummary: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  reason: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  section: { gap: spacing.md },
  summaryGrid: { flexDirection: 'row', gap: spacing.sm },
  metric: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.xs,
  },
  metricLabel: { color: colors.subtle, fontSize: 11 },
  metricValue: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: colors.ink, fontSize: 19, fontWeight: '900' },
  sectionTrailing: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  list: { gap: spacing.md },
  dataCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  dataHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dataTitle: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  smallBadge: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 5 },
  smallBadgeText: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  dataValue: { color: colors.primaryDark, fontSize: 28, fontWeight: '900' },
  dataMeta: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  dataNote: { color: colors.subtle, fontSize: 11, lineHeight: 17 },
  weatherSummary: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  forecastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.sm,
  },
  forecastTime: { width: 42, color: colors.muted, fontSize: 12, fontWeight: '800' },
  forecastCondition: { flex: 1, color: colors.ink, fontSize: 12 },
  forecastTemp: {
    width: 42,
    color: colors.ink,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '800',
  },
  forecastRain: { width: 62, color: colors.muted, textAlign: 'right', fontSize: 10 },
  disclaimer: {
    padding: spacing.lg,
    backgroundColor: '#F0F3F7',
    borderRadius: radius.md,
    gap: spacing.xs,
  },
  disclaimerTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  disclaimerText: { color: colors.muted, fontSize: 11, lineHeight: 18 },
});
