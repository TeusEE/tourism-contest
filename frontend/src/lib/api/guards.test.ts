import { describe, expect, it } from "vitest";

import { WEB_CLIENT_PLATFORM } from "./contracts";
import {
  isErrorResponse,
  isLocationSuggestionResponse,
  isTravelPlanAnalysisResponse,
} from "./guards";

const validSuggestionResponse = {
  items: [
    {
      name: "서울역 (고속철도)",
      address: "서울특별시 용산구 동자동 43-205",
      roadAddress: "서울특별시 용산구 한강대로 405",
      location: { lat: 37.554073, lon: 126.9707021 },
    },
  ],
};

const validAnalysisResponse = {
  travelDate: "2026-10-03",
  route: {
    origin: { lat: 37.554678, lon: 126.970606 },
    destination: { lat: 35.158698, lon: 129.160384 },
    distanceMeters: 400000,
    durationSeconds: 18000,
    polyline: [{ lat: 37.554678, lon: 126.970606 }],
  },
  congestion: {
    level: "low",
    summary: "행사 밀집 가능성이 낮습니다.",
    reasons: [],
    isTrafficPrediction: false,
  },
  events: [],
  nearbyEventCount: 0,
  nearbyEventCountIsCapped: false,
  visitorReference: null,
  weather: {
    status: "not-yet-published",
    targetDate: "2026-10-03",
    summary: null,
    forecasts: [],
    note: "예보 미발표",
    checkedAt: "2026-08-28T12:00:00+09:00",
  },
  warnings: [],
  generatedAt: "2026-08-28T12:00:00+09:00",
};

describe("API response guards", () => {
  it("accepts the location suggestion response shape", () => {
    expect(isLocationSuggestionResponse(validSuggestionResponse)).toBe(true);
  });

  it("keeps the web request platform compatible with the current backend", () => {
    expect(WEB_CLIENT_PLATFORM).toBe("AND");
  });

  it("accepts the shared analysis response shape", () => {
    expect(isTravelPlanAnalysisResponse(validAnalysisResponse)).toBe(true);
  });

  it("rejects a response that changes the traffic prediction invariant", () => {
    expect(
      isTravelPlanAnalysisResponse({
        ...validAnalysisResponse,
        congestion: {
          ...validAnalysisResponse.congestion,
          isTrafficPrediction: true,
        },
      }),
    ).toBe(false);
  });

  it("rejects invalid coordinates and incomplete route data", () => {
    expect(
      isTravelPlanAnalysisResponse({
        ...validAnalysisResponse,
        route: { ...validAnalysisResponse.route, origin: { lat: 91, lon: 0 } },
      }),
    ).toBe(false);
  });

  it("accepts the safe error response shape", () => {
    expect(
      isErrorResponse({
        requestId: "request-1",
        error: {
          code: "LOCATION_NOT_FOUND",
          message: "위치를 확인하지 못했습니다.",
          fields: [],
        },
      }),
    ).toBe(true);
  });
});
