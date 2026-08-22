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
  ...inputProps
}: LocationAutocompleteInputProps) {
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [requestFailed, setRequestFailed] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const query = value.trim();
    const currentRequestId = ++requestId.current;
    const controller = new AbortController();

    if (!focused || !shouldSuggest(query)) {
      return () => controller.abort();
    }

    const timer = setTimeout(() => {
      setLoading(true);
      setRequestFailed(false);
      void requestLocationSuggestions(query, { signal: controller.signal })
        .then((items) => {
          if (requestId.current !== currentRequestId) return;
          setSuggestions(items);
        })
        .catch((error: unknown) => {
          if (requestId.current !== currentRequestId) return;
          if (error instanceof ApiClientError && error.kind === 'cancelled') return;
          setSuggestions([]);
          setRequestFailed(true);
        })
        .finally(() => {
          if (requestId.current === currentRequestId) setLoading(false);
        });
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [focused, value]);

  const handleSelect = (suggestion: LocationSuggestion) => {
    const normalized = suggestion.roadAddress ?? suggestion.address ?? suggestion.name;
    onChangeText(normalized);
    setSuggestions([]);
    setFocused(false);
    Keyboard.dismiss();
  };

  const handleChangeText = (nextValue: string) => {
    onChangeText(nextValue);
    setSuggestions([]);
    setRequestFailed(false);
    if (!shouldSuggest(nextValue.trim())) setLoading(false);
  };

  return (
    <View style={styles.wrapper}>
      <AppTextInput
        {...inputProps}
        accessibilityLabel={inputProps.accessibilityLabel ?? label}
        error={error}
        label={label}
        onBlur={(event) => {
          onBlur?.(event);
          setTimeout(() => {
            setSuggestions([]);
            setLoading(false);
            setFocused(false);
          }, 180);
        }}
        onChangeText={handleChangeText}
        onFocus={(event) => {
          onFocus?.(event);
          setFocused(true);
        }}
        value={value}
      />

      {focused && loading ? (
        <View accessibilityLiveRegion="polite" style={styles.statusRow}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={styles.statusText}>장소를 찾고 있어요.</Text>
        </View>
      ) : null}

      {focused && !loading && suggestions.length > 0 ? (
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

      {focused && !loading && requestFailed ? (
        <Text style={styles.statusText}>
          장소 추천을 사용할 수 없어요. 주소를 직접 입력해도 괜찮아요.
        </Text>
      ) : null}
    </View>
  );
}

function shouldSuggest(query: string): boolean {
  // A digit usually indicates a complete road address. Avoid an extra local
  // search request in that case; the analysis geocoder handles it directly.
  return query.length >= 2 && query.length <= 80 && !/\d/.test(query);
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
