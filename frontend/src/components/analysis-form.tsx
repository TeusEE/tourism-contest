"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ApiClientError, requestLocationSuggestions } from "@/lib/api/client";
import type { LocationSuggestion } from "@/lib/api/contracts";
import { useAnalysis } from "@/lib/analysis/context";
import {
  hasValidationErrors,
  localDateString,
  type AnalysisInput,
  validateAnalysisInput,
} from "@/lib/analysis/validation";

const KEYWORDS = ["축제", "공연", "스포츠", "전시", "박람회", "문화"];

export function AnalysisForm() {
  const router = useRouter();
  const {
    state,
    updateInput,
    toggleKeyword,
    setValidationErrors,
    submitAnalysis,
  } = useAnalysis();
  const errors = state.validationErrors;
  const isLoading = state.phase === "loading";
  const datePresets = useMemo(
    () => [
      { label: "오늘", value: localDateString() },
      { label: "내일", value: localDateString(1) },
      { label: "일주일 후", value: localDateString(7) },
    ],
    [],
  );

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading) return;

    const input: AnalysisInput = {
      ...state.input,
      origin: state.input.origin.trim(),
      destination: state.input.destination.trim(),
      departureTime: state.input.departureTime.trim(),
      eventKeywords: state.input.eventKeywords.map((keyword) => keyword.trim()),
    };
    const validationErrors = validateAnalysisInput(input);
    if (hasValidationErrors(validationErrors)) {
      setValidationErrors(validationErrors);
      return;
    }

    void submitAnalysis(input);
    router.push("/results");
  };

  return (
    <form
      className="surface-card analysis-form"
      noValidate
      onSubmit={handleSubmit}
    >
      <div className="form-heading">
        <div>
          <p className="section-kicker">TRAVEL PLAN</p>
          <h2>여행 계획</h2>
        </div>
        <span>필수 항목을 입력해 주세요</span>
      </div>

      <div className="form-fields">
        <LocationAutocompleteField
          disabled={isLoading}
          error={errors.origin}
          field="origin"
          label="출발지"
          placeholder="예: 서울역"
          value={state.input.origin}
          onChange={(origin) => updateInput({ origin })}
        />
        <LocationAutocompleteField
          disabled={isLoading}
          error={errors.destination}
          field="destination"
          label="여행지"
          placeholder="예: 부산 해운대"
          value={state.input.destination}
          onChange={(destination) => updateInput({ destination })}
        />

        <div className="form-field form-field--date">
          <label htmlFor="travel-date">여행일</label>
          <input
            aria-describedby={
              errors.travelDate ? "travel-date-error" : undefined
            }
            aria-invalid={Boolean(errors.travelDate)}
            disabled={isLoading}
            id="travel-date"
            min={localDateString()}
            type="date"
            value={state.input.travelDate}
            onChange={(event) =>
              updateInput({ travelDate: event.target.value })
            }
          />
          {errors.travelDate ? (
            <span className="field-error" id="travel-date-error" role="alert">
              {errors.travelDate}
            </span>
          ) : (
            <span className="field-hint">
              날짜를 직접 입력하거나 빠른 선택을 이용하세요.
            </span>
          )}
          <div
            aria-label="여행일 빠른 선택"
            className="quick-date-row"
            role="group"
          >
            {datePresets.map((preset) => (
              <button
                aria-pressed={preset.value === state.input.travelDate}
                className={`quick-date ${preset.value === state.input.travelDate ? "quick-date--selected" : ""}`}
                disabled={isLoading}
                key={preset.label}
                type="button"
                onClick={() => updateInput({ travelDate: preset.value })}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="departure-time">
            출발 예정 시각 <span>(선택)</span>
          </label>
          <input
            aria-describedby={
              errors.departureTime
                ? "departure-time-error"
                : "departure-time-hint"
            }
            aria-invalid={Boolean(errors.departureTime)}
            disabled={isLoading}
            id="departure-time"
            type="time"
            value={state.input.departureTime}
            onChange={(event) =>
              updateInput({ departureTime: event.target.value })
            }
          />
          {errors.departureTime ? (
            <span
              className="field-error"
              id="departure-time-error"
              role="alert"
            >
              {errors.departureTime}
            </span>
          ) : (
            <span className="field-hint" id="departure-time-hint">
              출발 시각은 분석 참고용으로만 사용됩니다.
            </span>
          )}
        </div>
      </div>

      <fieldset className="keyword-fieldset">
        <legend>
          <span>관심 행사 유형</span>
          <strong>{state.input.eventKeywords.length}/10</strong>
        </legend>
        <p className="field-hint">
          선택한 유형을 중심으로 행사 정보를 살펴봅니다.
        </p>
        <div className="keyword-list">
          {KEYWORDS.map((keyword) => {
            const selected = state.input.eventKeywords.includes(keyword);
            return (
              <button
                aria-checked={selected}
                className={`keyword-chip ${selected ? "keyword-chip--selected" : ""}`}
                disabled={isLoading}
                key={keyword}
                role="checkbox"
                type="button"
                onClick={() => toggleKeyword(keyword)}
              >
                <span aria-hidden="true">{selected ? "✓ " : ""}</span>
                {keyword}
              </button>
            );
          })}
        </div>
        {errors.eventKeywords ? (
          <span className="field-error" role="alert">
            {errors.eventKeywords}
          </span>
        ) : null}
      </fieldset>

      <button
        aria-busy={isLoading}
        className="button button--primary button--wide submit-button"
        disabled={isLoading}
        type="submit"
      >
        {isLoading ? "분석 중..." : "주변 행사 분석하기"}
      </button>
      <p className="privacy-note">
        입력한 여행 정보와 분석 결과는 앱과 서버에 영구 저장되지 않습니다.
      </p>
    </form>
  );
}

interface LocationAutocompleteFieldProps {
  disabled: boolean;
  error?: string;
  field: "origin" | "destination";
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}

function LocationAutocompleteField({
  disabled,
  error,
  field,
  label,
  placeholder,
  value,
  onChange,
}: LocationAutocompleteFieldProps) {
  const inputId = `${field}-location`;
  const listId = `${useId().replaceAll(":", "")}-suggestions`;
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [suggestionState, setSuggestionState] = useState<
    "idle" | "loading" | "empty" | "error"
  >("idle");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selectedSuggestionValue, setSelectedSuggestionValue] = useState<
    string | null
  >(null);
  const requestId = useRef(0);
  const activeController = useRef<AbortController | null>(null);

  useEffect(() => {
    const query = value.trim();
    const currentRequestId = ++requestId.current;
    const controller = new AbortController();

    if (
      !focused ||
      disabled ||
      !shouldSuggest(query) ||
      selectedSuggestionValue === query
    ) {
      activeController.current?.abort();
      activeController.current = null;
      return () => controller.abort();
    }

    const timer = window.setTimeout(() => {
      if (requestId.current !== currentRequestId) return;
      activeController.current?.abort();
      activeController.current = controller;
      setSuggestionState("loading");
      void requestLocationSuggestions(query, { signal: controller.signal })
        .then((items) => {
          if (requestId.current !== currentRequestId) return;
          setSuggestions(items);
          setSuggestionState(items.length > 0 ? "idle" : "empty");
        })
        .catch((error: unknown) => {
          if (requestId.current !== currentRequestId) return;
          if (
            error instanceof ApiClientError &&
            error.state.kind === "cancelled"
          ) {
            return;
          }
          setSuggestions([]);
          setSuggestionState("error");
        })
        .finally(() => {
          if (activeController.current === controller) {
            activeController.current = null;
          }
        });
    }, 300);

    return () => {
      window.clearTimeout(timer);
      activeController.current?.abort();
      activeController.current = null;
      controller.abort();
    };
  }, [disabled, focused, selectedSuggestionValue, value]);

  const selectSuggestion = (suggestion: LocationSuggestion) => {
    const normalizedValue =
      suggestion.roadAddress ?? suggestion.address ?? suggestion.name;
    onChange(normalizedValue);
    setSelectedSuggestionValue(normalizedValue);
    setSuggestions([]);
    setSuggestionState("idle");
    setActiveIndex(-1);
    setFocused(false);
  };

  const requestSuggestionsImmediately = () => {
    const query = value.trim();
    if (!focused || disabled || !shouldSuggest(query)) return;

    const currentRequestId = ++requestId.current;
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    setSuggestions([]);
    setSuggestionState("loading");
    setActiveIndex(-1);

    void requestLocationSuggestions(query, { signal: controller.signal })
      .then((items) => {
        if (requestId.current !== currentRequestId) return;
        setSuggestions(items);
        setSuggestionState(items.length > 0 ? "idle" : "empty");
      })
      .catch((error: unknown) => {
        if (requestId.current !== currentRequestId) return;
        if (
          error instanceof ApiClientError &&
          error.state.kind === "cancelled"
        ) {
          return;
        }
        setSuggestions([]);
        setSuggestionState("error");
      })
      .finally(() => {
        if (activeController.current === controller) {
          activeController.current = null;
        }
      });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setActiveIndex((index) =>
        index <= 0 ? suggestions.length - 1 : index - 1,
      );
    } else if (event.key === "Escape") {
      setSuggestions([]);
      setSuggestionState("idle");
      setActiveIndex(-1);
    } else if (event.key === "Enter") {
      const query = value.trim();

      if (suggestions.length > 0) {
        // 첫 Enter는 첫 후보를 키보드로 가리키고, 두 번째 Enter 또는 클릭으로 후보를 확정한다.
        event.preventDefault();
        if (activeIndex >= 0) {
          selectSuggestion(suggestions[activeIndex]);
        } else {
          setActiveIndex(0);
        }
      } else if (suggestionState === "loading") {
        // 입력 직후 Enter를 눌러도 후보 요청이 끝나기 전에 폼이 제출되지 않도록 한다.
        event.preventDefault();
      } else if (
        suggestionState !== "empty" &&
        suggestionState !== "error" &&
        selectedSuggestionValue !== query &&
        shouldSuggest(query)
      ) {
        // 디바운스가 아직 실행되지 않은 경우 Enter를 후보 검색 버튼처럼 사용한다.
        event.preventDefault();
        requestSuggestionsImmediately();
      }
    }
  };

  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const activeOptionId =
    activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined;

  return (
    <div className="form-field autocomplete-field">
      <label htmlFor={inputId}>{label}</label>
      <div className="autocomplete-control">
        <input
          aria-activedescendant={activeOptionId}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-describedby={error ? errorId : hintId}
          aria-expanded={!disabled && focused && suggestions.length > 0}
          aria-invalid={Boolean(error)}
          autoComplete="off"
          disabled={disabled}
          id={inputId}
          placeholder={placeholder}
          role="combobox"
          type="text"
          value={value}
          onBlur={() => {
            window.setTimeout(() => {
              setFocused(false);
              setSuggestions([]);
              setActiveIndex(-1);
            }, 150);
          }}
          onChange={(event) => {
            setSelectedSuggestionValue(null);
            onChange(event.target.value);
            setSuggestions([]);
            setSuggestionState("idle");
            setActiveIndex(-1);
          }}
          onFocus={() => {
            setFocused(true);
            setSuggestions([]);
            setSuggestionState("idle");
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
        />
        {focused && suggestionState === "loading" ? (
          <span
            aria-label="장소 추천을 불러오는 중"
            className="autocomplete-spinner"
          />
        ) : null}
      </div>
      {error ? (
        <span className="field-error" id={errorId} role="alert">
          {error}
        </span>
      ) : (
        <span className="field-hint" id={hintId}>
          장소명이나 도로명 주소를 입력한 뒤 Enter로 후보를 확인하고, 정확한
          주소를 선택하세요.
        </span>
      )}
      {focused && suggestions.length > 0 ? (
        <span className="field-status" role="status">
          후보를 클릭하거나 ↑↓ 후 Enter로 정확한 주소를 선택하세요.
        </span>
      ) : null}
      {focused && suggestionState === "empty" ? (
        <span className="field-status" role="status">
          장소 후보가 없어요. 주소를 직접 입력해도 괜찮아요.
        </span>
      ) : null}
      {focused && suggestionState === "error" ? (
        <span className="field-status field-status--warning" role="status">
          장소 추천을 사용할 수 없어요. 주소를 직접 입력해도 괜찮아요.
        </span>
      ) : null}
      {!disabled && focused && suggestions.length > 0 ? (
        <div
          aria-label={`${label} 후보`}
          className="suggestion-list"
          id={listId}
          role="listbox"
        >
          {suggestions.map((suggestion, index) => {
            const address = suggestion.roadAddress ?? suggestion.address;
            return (
              <button
                aria-selected={index === activeIndex}
                className="suggestion-option"
                id={`${listId}-option-${index}`}
                key={`${suggestion.name}-${suggestion.location.lat}-${suggestion.location.lon}`}
                role="option"
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectSuggestion(suggestion)}
              >
                <strong>{suggestion.name}</strong>
                {address ? <span>{address}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function shouldSuggest(query: string): boolean {
  return query.length >= 2 && query.length <= 80;
}
