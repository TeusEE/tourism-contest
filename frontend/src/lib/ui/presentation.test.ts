import { describe, expect, it } from "vitest";

import {
  apiErrorTitle,
  congestionLabels,
  formatCheckedAt,
  formatDistance,
  formatDuration,
  formatEventCount,
  visitorStatusLabel,
  warningTitle,
  weatherConditionLabel,
  weatherStatusLabel,
} from "./presentation";

describe("result presentation helpers", () => {
  it("maps congestion and provider states to safe Korean labels", () => {
    expect(congestionLabels.high).toBe("높음");
    expect(visitorStatusLabel("available")).toBe("참고값 확인");
    expect(visitorStatusLabel("failed")).toBe("조회 실패");
    expect(weatherStatusLabel("not-yet-published")).toBe("예보 미발표");
    expect(weatherConditionLabel("rain-snow")).toBe("비 또는 눈");
  });

  it("keeps unknown provider codes understandable", () => {
    expect(warningTitle("UNKNOWN_PROVIDER_CODE")).toBe("데이터 안내");
    expect(apiErrorTitle("UNKNOWN_ERROR")).toBe("분석 오류");
  });

  it("formats dynamic result numbers without implying traffic prediction", () => {
    expect(formatEventCount(0, false)).toBe("0개");
    expect(formatEventCount(5, true)).toBe("5개 이상");
    expect(formatEventCount(null, false)).toBe("확인 필요");
    expect(formatDistance(950)).toBe("950m");
    expect(formatDistance(403200)).toBe("403.2km");
    expect(formatDuration(0)).toBe("0분");
    expect(formatDuration(16_560)).toBe("4시간 36분");
  });

  it("formats checked timestamps while preserving an unexpected value", () => {
    expect(formatCheckedAt("2026-08-28T21:22:00+09:00")).toBe(
      "2026-08-28 21:22",
    );
    expect(formatCheckedAt("unknown")).toBe("unknown");
  });
});
