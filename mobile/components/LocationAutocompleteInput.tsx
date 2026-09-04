import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  type TextInputProps,
  View,
} from 'react-native';

import { ApiClientError, requestLocationSuggestions } from '@/src/api/client';
import type { LocationSuggestion } from '@/src/api/contracts';
import { colors, radius, spacing } from '@/src/theme';
import { Text } from './Themed';
import { AppTextInput } from './AppTextInput';

interface LocationAutocompleteInputProps extends Omit<TextInputProps, 'onChangeText' | 'value'> {
  label: string;
  value: string;
  error?: string;
  onChangeText: (value: string) => void;
}

export function LocationAutocompleteInput({
  label,
  value,
  error,
  onChangeText,
  onFocus,
  onBlur,
  onSubmitEditing,
  ...inputProps
}: LocationAutocompleteInputProps) {
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [suggestionState, setSuggestionState] = useState<'idle' | 'loading' | 'empty' | 'error'>(
    'idle',
  );
  const requestId = useRef(0);
  const selectedSuggestionValue = useRef<string | null>(null);
  const activeController = useRef<AbortController | null>(null);

  useEffect(() => {
    const query = value.trim();
    const currentRequestId = ++requestId.current;
    const controller = new AbortController();

    if (!focused || !shouldSuggest(query) || selectedSuggestionValue.current === query) {
      activeController.current?.abort();
      activeController.current = null;
      return () => controller.abort();
    }

    const timer = setTimeout(() => {
      activeController.current?.abort();
      activeController.current = controller;
      setSuggestionState('loading');
      void requestLocationSuggestions(query, { signal: controller.signal })
        .then((items) => {
          if (requestId.current !== currentRequestId) return;
          setSuggestions(items);
          setSuggestionState(items.length > 0 ? 'idle' : 'empty');
        })
        .catch((error: unknown) => {
          if (requestId.current !== currentRequestId) return;
          if (error instanceof ApiClientError && error.kind === 'cancelled') return;
          setSuggestions([]);
          setSuggestionState('error');
        })
        .finally(() => {
          if (activeController.current === controller) {
            activeController.current = null;
          }
        });
    }, 300);

    return () => {
      clearTimeout(timer);
      activeController.current?.abort();
      activeController.current = null;
      controller.abort();
    };
  }, [focused, value]);

  const handleSelect = (suggestion: LocationSuggestion) => {
    const normalized = suggestion.roadAddress ?? suggestion.address ?? suggestion.name;
    onChangeText(normalized);
    selectedSuggestionValue.current = normalized;
    setSuggestions([]);
    setSuggestionState('idle');
    setFocused(false);
    Keyboard.dismiss();
  };

  const handleChangeText = (nextValue: string) => {
    selectedSuggestionValue.current = null;
    onChangeText(nextValue);
    setSuggestions([]);
    setSuggestionState('idle');
  };

  const requestSuggestionsImmediately = () => {
    const query = value.trim();
    if (!focused || !shouldSuggest(query)) return;

    const currentRequestId = ++requestId.current;
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    setSuggestions([]);
    setSuggestionState('loading');

    void requestLocationSuggestions(query, { signal: controller.signal })
      .then((items) => {
        if (requestId.current !== currentRequestId) return;
        setSuggestions(items);
        setSuggestionState(items.length > 0 ? 'idle' : 'empty');
      })
      .catch((error: unknown) => {
        if (requestId.current !== currentRequestId) return;
        if (error instanceof ApiClientError && error.kind === 'cancelled') return;
        setSuggestions([]);
        setSuggestionState('error');
      })
      .finally(() => {
        if (activeController.current === controller) {
          activeController.current = null;
        }
      });
  };

  const handleSubmitEditing: NonNullable<TextInputProps['onSubmitEditing']> = (event) => {
    const query = value.trim();

    if (suggestions.length > 0 || suggestionState === 'loading') {
      // 후보를 먼저 확인하고 선택할 수 있도록 키보드 제출로 다음 필드로 이동하지 않는다.
      return;
    }

    if (
      suggestionState !== 'empty' &&
      suggestionState !== 'error' &&
      selectedSuggestionValue.current !== query &&
      shouldSuggest(query)
    ) {
      // 디바운스가 아직 실행되지 않은 경우 Return 키를 후보 검색 버튼처럼 사용한다.
      requestSuggestionsImmediately();
      return;
    }

    onSubmitEditing?.(event);
  };

  return (
    <View style={styles.wrapper}>
      <AppTextInput
        {...inputProps}
        accessibilityLabel={inputProps.accessibilityLabel ?? label}
        blurOnSubmit={false}
        error={error}
        label={label}
        onBlur={(event) => {
          onBlur?.(event);
          setTimeout(() => {
            setSuggestions([]);
            setSuggestionState('idle');
            setFocused(false);
          }, 180);
        }}
        onChangeText={handleChangeText}
        onFocus={(event) => {
          onFocus?.(event);
          setFocused(true);
        }}
        onSubmitEditing={handleSubmitEditing}
        value={value}
      />

      {focused && suggestionState === 'loading' ? (
        <View accessibilityLiveRegion="polite" style={styles.statusRow}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={styles.statusText}>장소를 찾고 있어요.</Text>
        </View>
      ) : null}

      {focused && suggestions.length > 0 ? (
        <Text style={styles.statusText}>후보를 눌러 정확한 주소로 입력을 확정하세요.</Text>
      ) : null}

      {focused && suggestionState !== 'loading' && suggestions.length > 0 ? (
        <View accessibilityRole="list" style={styles.suggestionList}>
          {suggestions.map((suggestion, index) => {
            const address = suggestion.roadAddress ?? suggestion.address;
            return (
              <Pressable
                accessibilityLabel={`${suggestion.name}${address ? `, ${address}` : ''}`}
                accessibilityRole="button"
                key={`${suggestion.name}-${suggestion.location.lat}-${suggestion.location.lon}-${index}`}
                onPress={() => handleSelect(suggestion)}
                style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
              >
                <Text style={styles.suggestionName}>{suggestion.name}</Text>
                {address ? <Text style={styles.suggestionAddress}>{address}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {focused && suggestionState === 'empty' ? (
        <Text style={styles.statusText}>장소 후보가 없어요. 주소를 직접 입력해도 괜찮아요.</Text>
      ) : null}

      {focused && suggestionState === 'error' ? (
        <Text style={styles.statusText}>
          장소 추천을 사용할 수 없어요. 주소를 직접 입력해도 괜찮아요.
        </Text>
      ) : null}
    </View>
  );
}

function shouldSuggest(query: string): boolean {
  // 도로명 주소도 사용자가 입력한 표현 그대로 후보를 확인할 수 있도록 검색한다.
  return query.length >= 2 && query.length <= 80;
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.sm },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusText: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  suggestionList: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  suggestion: { gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  suggestionName: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  suggestionAddress: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  pressed: { backgroundColor: colors.primarySoft },
});
