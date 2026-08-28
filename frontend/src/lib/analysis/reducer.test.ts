import { describe, expect, it } from "vitest";

import { analysisReducer, initialAnalysisState } from "./context";
import type { TravelPlanAnalysisResponse } from "../api/contracts";

const fakeResponse: TravelPlanAnalysisResponse = {
  travelDate: "2026-10-03",
  route: {
    origin: { lat: 37.5, lon: 126.9 },
    destination: { lat: 35.1, lon: 129.1 },
    distanceMeters: 10,
    durationSeconds: 20,
    polyline: [],
  },
  congestion: {
    level: "low",
    summary: "확인됨",
    reasons: [],
    isTrafficPrediction: false,
  },
  events: [],
  nearbyEventCount: 0,
  nearbyEventCountIsCapped: false,
  visitorReference: null,
  weather: {
    status: "no-data",
    targetDate: "2026-10-03",
    summary: null,
    forecasts: [],
    note: null,
    checkedAt: "2026-08-28T12:00:00+09:00",
  },
  warnings: [],
  generatedAt: "2026-08-28T12:00:00+09:00",
};

describe("analysis state reducer", () => {
  it("keeps the submitted input in memory through loading and success", () => {
    const input = {
      ...initialAnalysisState.input,
      origin: "서울역",
      destination: "부산역",
    };
    const loading = analysisReducer(initialAnalysisState, {
      type: "start",
      input,
      requestId: "request-1",
    });
    const success = analysisReducer(loading, {
      type: "success",
      requestId: "request-1",
      result: fakeResponse,
    });
    expect(loading.phase).toBe("loading");
    expect(loading.submittedInput?.origin).toBe("서울역");
    expect(success.phase).toBe("success");
    expect(success.result?.route.distanceMeters).toBe(10);
  });

  it("does not allow input changes while loading", () => {
    const loading = analysisReducer(initialAnalysisState, {
      type: "start",
      input: initialAnalysisState.input,
      requestId: "request-1",
    });
    const next = analysisReducer(loading, {
      type: "input",
      patch: { origin: "변경" },
    });
    expect(next).toBe(loading);
  });

  it("does not start a duplicate analysis while loading", () => {
    const loading = analysisReducer(initialAnalysisState, {
      type: "start",
      input: initialAnalysisState.input,
      requestId: "request-1",
    });
    const duplicate = analysisReducer(loading, {
      type: "start",
      input: initialAnalysisState.input,
      requestId: "request-2",
    });

    expect(duplicate).toBe(loading);
    expect(duplicate.activeRequestId).toBe("request-1");
  });

  it("clears in-memory input and result on reset", () => {
    const input = {
      ...initialAnalysisState.input,
      origin: "서울역",
      destination: "부산역",
    };
    const loaded = analysisReducer(
      analysisReducer(initialAnalysisState, {
        type: "start",
        input,
        requestId: "request-1",
      }),
      { type: "success", requestId: "request-1", result: fakeResponse },
    );
    const reset = analysisReducer(loaded, { type: "reset" });
    expect(reset).toEqual(initialAnalysisState);
    expect(reset.input.origin).toBe("");
    expect(reset.result).toBeNull();
  });

  it("ignores a late response from an older request", () => {
    const firstLoading = analysisReducer(initialAnalysisState, {
      type: "start",
      input: initialAnalysisState.input,
      requestId: "request-1",
    });
    const cancelled = analysisReducer(firstLoading, {
      type: "cancelled",
      requestId: "request-1",
    });
    const secondLoading = analysisReducer(cancelled, {
      type: "start",
      input: initialAnalysisState.input,
      requestId: "request-2",
    });
    const staleSuccess = analysisReducer(secondLoading, {
      type: "success",
      requestId: "request-1",
      result: fakeResponse,
    });

    expect(staleSuccess).toBe(secondLoading);
    expect(staleSuccess.activeRequestId).toBe("request-2");
    expect(staleSuccess.phase).toBe("loading");
  });
});
