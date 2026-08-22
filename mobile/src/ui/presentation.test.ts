import { describe, expect, it } from '@jest/globals';

import {
  apiErrorTitle,
  formatCheckedAt,
  visitorStatusLabel,
  warningTitle,
  weatherStatusLabel,
} from './presentation';

describe('result presentation labels', () => {
  it('uses safe user-facing names for provider warnings', () => {
    expect(warningTitle('WEATHER_NOT_YET_PUBLISHED')).toBe('날씨 예보 미발표');
    expect(warningTitle('UNKNOWN_WARNING')).toBe('데이터 안내');
  });

  it('keeps server error codes out of the primary heading', () => {
    expect(apiErrorTitle('ROUTE_UNAVAILABLE')).toBe('경로 확인 실패');
    expect(apiErrorTitle('UNKNOWN_ERROR')).toBe('분석 오류');
  });

  it('distinguishes visitor and weather states', () => {
    expect(visitorStatusLabel('available')).toBe('참고값 확인');
    expect(visitorStatusLabel('failed')).toBe('조회 실패');
    expect(weatherStatusLabel('not-yet-published')).toBe('예보 미발표');
  });

  it('formats checked-at labels without exposing raw fields', () => {
    expect(formatCheckedAt('2026-08-13T14:05:00+09:00')).toBe('2026-08-13 14:05');
    expect(formatCheckedAt('확인 불가')).toBe('확인 불가');
  });
});
