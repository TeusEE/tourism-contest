import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { requestAnalysis, requestLocationSuggestions, toTravelPlanRequest } from './client';

const input = {
  travelDate: '2026-10-03',
  origin: ' 서울역 ',
  destination: ' 부산 해운대 ',
  departureTime: '08:00',
  eventKeywords: ['축제', '공연'],
};

const responseBody = {
  travelDate: '2026-10-03',
  route: {
    origin: { lat: 37.5, lon: 126.9 },
    destination: { lat: 35.1, lon: 129.1 },
    distanceMeters: 400000,
    durationSeconds: 18000,
    polyline: [],
  },
  congestion: { level: 'low', summary: '행사 없음', reasons: [], isTrafficPrediction: false },
  events: [],
  nearbyEventCount: 0,
  nearbyEventCountIsCapped: false,
  visitorReference: null,
  weather: {
    status: 'not-yet-published',
    targetDate: '2026-10-03',
    summary: null,
    forecasts: [],
    note: '예보 미발표',
    checkedAt: '2026-08-13T12:00:00+09:00',
  },
  warnings: [],
  generatedAt: '2026-08-13T12:00:00+09:00',
};

describe('FastAPI client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('normalizes the form into the shared request contract', () => {
    const request = toTravelPlanRequest(input);
    expect(request.origin).toBe('서울역');
    expect(request.destination).toBe('부산 해운대');
    expect(request.departureTime).toBe('08:00');
    expect(request.clientPlatform === 'IOS' || request.clientPlatform === 'AND').toBe(true);
  });

  it('returns a validated analysis response', async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => responseBody,
    } as Response);
    const result = await requestAnalysis(toTravelPlanRequest(input));
    expect(result.route.distanceMeters).toBe(400000);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/travel-plan/analyze'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns normalized place suggestions', async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            name: '서울역',
            address: '서울특별시 중구 봉래동2가 122-11',
            roadAddress: '서울특별시 중구 한강대로 405',
            location: { lat: 37.554678, lon: 126.970606 },
          },
        ],
      }),
    } as Response);

    const result = await requestLocationSuggestions(' 서울역 ');

    expect(result[0].roadAddress).toBe('서울특별시 중구 한강대로 405');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/locations/suggestions?q=%EC%84%9C%EC%9A%B8%EC%97%AD'),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('maps server errors without exposing raw response details', async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({
        requestId: 'request-1',
        error: { code: 'ROUTE_UNAVAILABLE', message: 'internal details', fields: [] },
      }),
    } as Response);
    await expect(requestAnalysis(toTravelPlanRequest(input))).rejects.toMatchObject({
      kind: 'server',
      code: 'ROUTE_UNAVAILABLE',
      status: 502,
      message: '자동차 경로를 확인하지 못했습니다.',
    });
  });
});
