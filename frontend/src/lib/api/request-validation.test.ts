import { describe, expect, it } from "vitest";

import {
  parseLocationSuggestionRequest,
  parseTravelPlanRequest,
} from "./request-validation";

describe("BFF request validation", () => {
  it("trims a location query and defaults the limit", () => {
    const parsed = parseLocationSuggestionRequest({ q: " 서울역 " });

    expect(parsed.errors).toEqual([]);
    expect(parsed.value).toEqual({ q: "서울역", limit: 5 });
  });

  it("rejects unsupported location proxy fields and limits", () => {
    const parsed = parseLocationSuggestionRequest({
      q: "서울역",
      limit: 6,
      url: "https://not-allowed.example",
    });

    expect(parsed.value).toBeNull();
    expect(parsed.errors.map((error) => error.field)).toEqual(["url", "limit"]);
  });

  it("normalizes the web analysis body and keeps AND platform compatibility", () => {
    const parsed = parseTravelPlanRequest({
      travelDate: "2026-10-03",
      origin: " 서울역 ",
      destination: { lat: 35.158698, lon: 129.160384 },
      clientPlatform: "AND",
      eventKeywords: [" 축제 ", "축제", " 공연"],
    });

    expect(parsed.errors).toEqual([]);
    expect(parsed.value).toMatchObject({
      travelDate: "2026-10-03",
      origin: "서울역",
      destination: { lat: 35.158698, lon: 129.160384 },
      clientPlatform: "AND",
      eventKeywords: ["축제", "공연"],
    });
  });

  it("rejects an iOS platform or malformed analysis values at the BFF boundary", () => {
    const parsed = parseTravelPlanRequest({
      travelDate: "2026-02-30",
      origin: "",
      destination: { lat: 91, lon: 0 },
      clientPlatform: "IOS",
      departureTime: "25:70",
      eventKeywords: ["x".repeat(41)],
    });

    expect(parsed.value).toBeNull();
    expect(parsed.errors.map((error) => error.field)).toEqual(
      expect.arrayContaining([
        "travelDate",
        "origin",
        "destination",
        "clientPlatform",
        "departureTime",
        "eventKeywords",
      ]),
    );
  });
});
