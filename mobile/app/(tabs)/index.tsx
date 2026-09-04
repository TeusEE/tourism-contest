import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { AppTextInput } from '@/components/AppTextInput';
import { LocationAutocompleteInput } from '@/components/LocationAutocompleteInput';
import { Text } from '@/components/Themed';
import { useAnalysis } from '@/src/state/analysis';
import {
  hasValidationErrors,
  localDateString,
  validateAnalysisInput,
} from '@/src/state/validation';
import { colors, radius, spacing } from '@/src/theme';

const KEYWORDS = ['축제', '공연', '스포츠', '전시', '박람회', '문화'];

export default function AnalysisInputScreen() {
  const router = useRouter();
  const { state, updateInput, toggleKeyword, submit } = useAnalysis();
  const errors = state.validationErrors;
  const isLoading = state.phase === 'loading';
  const datePresets = useMemo(
    () => [
      { label: '오늘', value: localDateString() },
      { label: '내일', value: localDateString(1) },
      { label: '일주일 후', value: localDateString(7) },
    ],
    [],
  );

  const handleSubmit = () => {
    const localErrors = validateAnalysisInput(state.input);
    if (hasValidationErrors(localErrors)) {
      void submit();
      return;
    }
    router.push('/results');
    void submit();
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>TRAVEL CONGESTION</Text>
            <Text accessibilityRole="header" style={styles.title}>
              여행 주변의 행사와{`\n`}행사 밀집 가능성을 확인해요
            </Text>
            <Text style={styles.description}>
              출발지와 여행일을 입력하면 목적지 주변의 행사, 방문객 참고값과 날씨를 한 번에 확인할
              수 있어요.
            </Text>
          </View>

          <View style={styles.formCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>여행 계획</Text>
              <Text style={styles.required}>필수 항목을 입력해 주세요</Text>
            </View>

            <View style={styles.fieldGroup}>
              <LocationAutocompleteInput
                autoCapitalize="none"
                autoCorrect={false}
                label="출발지"
                placeholder="예: 서울역"
                returnKeyType="search"
                value={state.input.origin}
                error={errors.origin}
                onChangeText={(origin) => updateInput({ origin })}
              />
              <LocationAutocompleteInput
                autoCapitalize="none"
                autoCorrect={false}
                label="여행지"
                placeholder="예: 부산 해운대"
                returnKeyType="search"
                value={state.input.destination}
                error={errors.destination}
                onChangeText={(destination) => updateInput({ destination })}
              />
            </View>

            <View style={styles.fieldGroup}>
              <AppTextInput
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
                label="여행일"
                maxLength={10}
                placeholder="YYYY-MM-DD"
                value={state.input.travelDate}
                error={errors.travelDate}
                hint="날짜를 직접 입력하거나 빠른 선택을 이용하세요."
                onChangeText={(travelDate) => updateInput({ travelDate })}
              />
              <View accessibilityRole="radiogroup" style={styles.presetRow}>
                {datePresets.map((preset) => {
                  const selected = preset.value === state.input.travelDate;
                  return (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      key={preset.label}
                      onPress={() => updateInput({ travelDate: preset.value })}
                      style={[styles.preset, selected && styles.presetSelected]}
                    >
                      <Text style={[styles.presetText, selected && styles.presetTextSelected]}>
                        {preset.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <AppTextInput
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
                label="출발 예정 시각 (선택)"
                maxLength={5}
                placeholder="예: 08:00"
                value={state.input.departureTime}
                error={errors.departureTime}
                hint="출발 시각은 분석 참고용으로만 사용됩니다."
                onChangeText={(departureTime) => updateInput({ departureTime })}
              />
            </View>

            <View style={styles.keywordGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>관심 행사 유형 (선택)</Text>
                <Text style={styles.counter}>{state.input.eventKeywords.length}/10</Text>
              </View>
              <Text style={styles.hint}>선택한 유형을 중심으로 행사 정보를 살펴봅니다.</Text>
              <View style={styles.chips}>
                {KEYWORDS.map((keyword) => {
                  const selected = state.input.eventKeywords.includes(keyword);
                  return (
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      key={keyword}
                      onPress={() => toggleKeyword(keyword)}
                      style={[styles.chip, selected && styles.chipSelected]}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                        {selected ? '✓ ' : ''}
                        {keyword}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {errors.eventKeywords ? (
                <Text style={styles.error}>{errors.eventKeywords}</Text>
              ) : null}
            </View>

            <AppButton label="주변 행사 분석하기" loading={isLoading} onPress={handleSubmit} />
            <Text style={styles.privacyNote}>
              입력한 여행 정보와 분석 결과는 앱과 서버에 영구 저장되지 않습니다.
            </Text>
          </View>

          <View style={styles.footerNote}>
            <Text style={styles.footerTitle}>행사 밀집 가능성 안내</Text>
            <Text style={styles.footerText}>
              결과의 밀집 가능성 등급은 목적지 반경 내 행사 개수를 바탕으로 한 참고 정보이며, 실제
              교통 지연시간을 예측하지 않습니다.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.paper },
  flex: { flex: 1 },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.xl },
  hero: { gap: spacing.md, paddingTop: spacing.sm },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1.6 },
  title: { color: colors.ink, fontSize: 30, lineHeight: 39, fontWeight: '900' },
  description: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.xl,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sectionHeader: { gap: spacing.xs },
  sectionTitle: { color: colors.ink, fontSize: 20, fontWeight: '900' },
  required: { color: colors.subtle, fontSize: 12 },
  fieldGroup: { gap: spacing.lg },
  presetRow: { flexDirection: 'row', gap: spacing.sm },
  preset: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  presetText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  presetTextSelected: { color: colors.primaryDark },
  keywordGroup: { gap: spacing.sm },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  counter: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  chipTextSelected: { color: colors.primaryDark },
  error: { color: colors.danger, fontSize: 12 },
  privacyNote: { color: colors.subtle, textAlign: 'center', fontSize: 11, lineHeight: 17 },
  footerNote: { gap: spacing.sm, paddingHorizontal: spacing.sm },
  footerTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  footerText: { color: colors.muted, fontSize: 12, lineHeight: 19 },
});
