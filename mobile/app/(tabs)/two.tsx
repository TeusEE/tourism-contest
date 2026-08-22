import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/Themed';
import { colors, radius, spacing } from '@/src/theme';

export default function InformationScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>ABOUT THIS SERVICE</Text>
        <Text accessibilityRole="header" style={styles.title}>
          여행 정보는 참고용으로{`\n`}안전하게 확인해요
        </Text>
        <Text style={styles.description}>
          Travel Congestion은 목적지 주변 행사 개수와 공공데이터를 조합해 행사 밀집 가능성을
          안내합니다.
        </Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>저장하지 않는 정보</Text>
          <Text style={styles.body}>
            입력한 출발지·여행지·여행일과 분석 결과는 앱과 분석 서버의 영구 저장소에 저장하지
            않습니다. 앱을 종료하면 화면 상태도 초기화됩니다.
          </Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>사용하는 출처</Text>
          <Text style={styles.body}>• NAVER Maps: 주소·자동차 경로 및 지도 표시 기반</Text>
          <Text style={styles.body}>• 한국관광공사: 행사·방문객·관광지 집중률 참고값</Text>
          <Text style={styles.body}>• 기상청: 여행지 단기예보</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>출처 및 이용 안내</Text>
          <Text style={styles.body}>
            각 데이터는 제공자의 공식 API를 확인한 시점의 참고값입니다. 행사 이미지는 저장하거나
            재배포하지 않고, 확인된 공식 행사 URL만 연결합니다.
          </Text>
          <Text style={styles.body}>
            지도·로고·공공데이터 표시와 이용 조건은 배포 환경의 제공자 약관을 기준으로 최종
            확인합니다.
          </Text>
        </View>
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>행사 밀집 가능성의 의미</Text>
          <Text style={styles.body}>
            목적지 반경 15km 내에서 여행일과 겹치는 행사 개수 기반의 가능성 등급입니다. 실제
            교통량이나 지연시간을 예측하는 서비스가 아닙니다.
          </Text>
        </View>
        <Text style={styles.version}>Travel Congestion MVP · 1.0.0</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.paper },
  content: { flex: 1, padding: spacing.xl, gap: spacing.lg },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: colors.ink, fontSize: 28, lineHeight: 37, fontWeight: '900' },
  description: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  notice: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  noticeTitle: { color: colors.primaryDark, fontSize: 14, fontWeight: '900' },
  version: { color: colors.subtle, fontSize: 11, marginTop: 'auto' },
});
