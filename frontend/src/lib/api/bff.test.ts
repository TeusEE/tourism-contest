import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as postSuggestions } from "@/app/api/locations/suggestions/route";
import { POST as postAnalysis } from "@/app/api/travel-plan/analyze/route";

import { BffError, getCloudRunApiBaseUrl } from "./bff";

const baseUrl = "https://cloud-run.example";

const validAnalysisResponse = {
  travelDate: "2026-10-03",
  route: {
    origin: { lat: 37.554678, lon: 126.970606 },
    destination: { lat: 35.158698, lon: 129.160384 },
    distanceMeters: 400000,
    durationSeconds: 18000,
    polyline: [],
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

beforeEach(() => {
  vi.stubEnv("CLOUD_RUN_API_BASE_URL", baseUrl);
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Cloud Run BFF routes", () => {
  it("proxies the validated suggestion request to the fixed upstream path", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            name: "서울역 (고속철도)",
            address: "서울특별시 용산구 동자동 43-205",
            roadAddress: "서울특별시 용산구 한강대로 405",
            location: { lat: 37.554073, lon: 126.9707021 },
          },
        ],
      }),
    );

    const response = await postSuggestions(
      jsonRequest("http://localhost/api/locations/suggestions", {
        q: " 서울역 ",
        limit: 5,
      }),
    );
    const payload = await response.json();
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];

    expect(response.status).toBe(200);
    expect(payload.items).toHaveLength(1);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(String(url)).toBe(
      `${baseUrl}/api/v1/locations/suggestions?q=%EC%84%9C%EC%9A%B8%EC%97%AD&limit=5`,
    );
    expect(init.method).toBe("GET");
  });

  it("rejects non-JSON, oversized, and extra-field requests before upstream access", async () => {
    const fetchMock = vi.mocked(fetch);
    const unsupported = await postSuggestions(
      new Request("http://localhost/api/locations/suggestions", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "{}",
      }),
    );
    const oversized = await postSuggestions(
      new Request("http://localhost/api/locations/suggestions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": "70000",
        },
        body: "{}",
      }),
    );
    const extraField = await postSuggestions(
      jsonRequest("http://localhost/api/locations/suggestions", {
        q: "서울역",
        url: "https://not-allowed.example",
      }),
    );

    expect(unsupported.status).toBe(415);
    expect(oversized.status).toBe(413);
    expect(extraField.status).toBe(422);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a safe invalid-response error when upstream JSON is malformed", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response("not-json", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );

    const response = await postSuggestions(
      jsonRequest("http://localhost/api/locations/suggestions", {
        q: "서울역",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.error.code).toBe("UPSTREAM_INVALID_RESPONSE");
    expect(payload.error.message).not.toContain("not-json");
  });

  it("forwards a structured upstream error without exposing its URL", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          requestId: "upstream-request",
          error: {
            code: "LOCATION_SUGGESTIONS_UNAVAILABLE",
            message: "장소 추천을 불러오지 못했습니다.",
            fields: [],
          },
        },
        503,
      ),
    );

    const response = await postSuggestions(
      jsonRequest("http://localhost/api/locations/suggestions", {
        q: "서울역",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe("LOCATION_SUGGESTIONS_UNAVAILABLE");
    expect(JSON.stringify(payload)).not.toContain(baseUrl);
  });

  it("normalizes and forwards an analysis request with the web-compatible platform", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse(validAnalysisResponse));

    const response = await postAnalysis(
      jsonRequest("http://localhost/api/travel-plan/analyze", {
        travelDate: "2026-10-03",
        origin: " 서울역 ",
        destination: " 부산 해운대 ",
        clientPlatform: "AND",
        eventKeywords: [" 축제 ", "축제"],
      }),
    );
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.travelDate).toBe("2026-10-03");
    expect(String(url)).toBe(`${baseUrl}/api/v1/travel-plan/analyze`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      origin: "서울역",
      destination: "부산 해운대",
      clientPlatform: "AND",
      eventKeywords: ["축제"],
    });
  });

  it("returns a configuration error when the upstream is not configured", async () => {
    vi.stubEnv("CLOUD_RUN_API_BASE_URL", "");
    const response = await postAnalysis(
      jsonRequest("http://localhost/api/travel-plan/analyze", {
        travelDate: "2026-10-03",
        origin: "서울역",
        destination: "부산역",
        clientPlatform: "AND",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe("UPSTREAM_NOT_CONFIGURED");
  });

  it("rejects upstream credentials and query data at the server boundary", () => {
    for (const value of [
      "https://user:password@cloud-run.example",
      "https://cloud-run.example?token=not-allowed",
    ]) {
      vi.stubEnv("CLOUD_RUN_API_BASE_URL", value);
      expect(() => getCloudRunApiBaseUrl()).toThrowError(BffError);
    }
  });
});

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
