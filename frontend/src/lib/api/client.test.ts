import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiClientError,
  requestAnalysis,
  requestLocationSuggestions,
  toTravelPlanRequest,
} from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("same-origin web API client", () => {
  it("trims and deduplicates input while omitting a blank optional time", () => {
    const request = toTravelPlanRequest({
      travelDate: "2026-10-03",
      origin: " 서울역 ",
      destination: " 부산역 ",
      departureTime: " ",
      eventKeywords: [" 축제 ", "축제", " 공연"],
    });

    expect(request).toEqual({
      travelDate: "2026-10-03",
      origin: "서울역",
      destination: "부산역",
      clientPlatform: "AND",
      eventKeywords: ["축제", "공연"],
    });
  });

  it("calls only the same-origin suggestion endpoint and validates the response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        items: [
          {
            name: "서울역",
            address: null,
            roadAddress: "서울특별시 용산구 한강대로 405",
            location: { lat: 37.55, lon: 126.97 },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestLocationSuggestions(" 서울역 ")).resolves.toHaveLength(
      1,
    );
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/locations/suggestions");
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      q: "서울역",
      limit: 5,
    });
  });

  it("maps a structured server error without exposing arbitrary upstream data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            requestId: "request-1",
            error: {
              code: "LOCATION_NOT_FOUND",
              message: "출발지 또는 여행지를 확인하지 못했습니다.",
              fields: [],
            },
          },
          422,
        ),
      ),
    );

    await expect(
      requestAnalysis({
        travelDate: "2026-10-03",
        origin: "없는 출발지",
        destination: "없는 여행지",
        clientPlatform: "AND",
      }),
    ).rejects.toMatchObject({
      state: {
        kind: "server",
        code: "LOCATION_NOT_FOUND",
        status: 422,
      },
    });
  });

  it("classifies malformed successful JSON as invalid-response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ unexpected: true })),
    );

    const error = await requestAnalysis({
      travelDate: "2026-10-03",
      origin: "서울역",
      destination: "부산역",
      clientPlatform: "AND",
    }).catch((value: unknown) => value);

    expect(error).toBeInstanceOf(ApiClientError);
    expect((error as ApiClientError).state.kind).toBe("invalid-response");
  });

  it("maps an external AbortController signal to a cancelled client error", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
          }),
      ),
    );
    const request = requestAnalysis(
      {
        travelDate: "2026-10-03",
        origin: "서울역",
        destination: "부산역",
        clientPlatform: "AND",
      },
      { signal: controller.signal },
    );
    controller.abort();

    await expect(request).rejects.toMatchObject({
      state: { kind: "cancelled", code: "REQUEST_CANCELLED" },
    });
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
