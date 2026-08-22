import { describe, expect, it } from '@jest/globals';

import type { TravelPlanAnalysisResponse } from '@/src/api/contracts';
import { analysisReducer, initialAnalysisInput } from './analysis';

const fakeResponse = {
  travelDate: '2026-10-03',
  route: {
    origin: { lat: 37.5, lon: 126.9 },
    destination: { lat: 35.1, lon: 129.1 },
    distanceMeters: 10,
    durationSeconds: 20,
    polyline: [],
  },
  congestion: { level: 'low', summary: '확인됨', reasons: [], isTrafficPrediction: false },
  events: [],
  nearbyEventCount: 0,
  nearbyEventCountIsCapped: false,
  visitorReference: null,
  weather: {
    status: 'no-data',
    targetDate: '2026-10-03',
    summary: null,
    forecasts: [],
    note: null,
    checkedAt: '2026-08-13T12:00:00+09:00',
  },
  warnings: [],
  generatedAt: '2026-08-13T12:00:00+09:00',
} as TravelPlanAnalysisResponse;

describe('analysis state reducer', () => {
  it('keeps input in memory and transitions through loading to success', () => {
    const input = { ...initialAnalysisInput, origin: '서울역', destination: '부산역' };
    const loading = analysisReducer({ ...initialState(), input }, { type: 'start', input });
    const success = analysisReducer(loading, { type: 'success', result: fakeResponse });
    expect(loading.phase).toBe('loading');
    expect(success.phase).toBe('success');
    expect(success.result?.route.distanceMeters).toBe(10);
  });

  it('clears a previous result when starting a new request', () => {
    const loaded = analysisReducer(initialState(), { type: 'success', result: fakeResponse });
    const next = analysisReducer(loaded, {
      type: 'start',
      input: { ...initialAnalysisInput, origin: 'A', destination: 'B' },
    });
    expect(next.phase).toBe('loading');
    expect(next.result).toBeNull();
  });

  it('clears in-memory input and result on reset', () => {
    const input = { ...initialAnalysisInput, origin: '서울역', destination: '부산역' };
    const loaded = analysisReducer(analysisReducer(initialState(), { type: 'start', input }), {
      type: 'success',
      result: fakeResponse,
    });
    const reset = analysisReducer(loaded, { type: 'reset' });
    expect(reset.input.origin).toBe('');
    expect(reset.result).toBeNull();
    expect(reset.phase).toBe('idle');
  });
});

function initialState() {
  return {
    input: initialAnalysisInput,
    submittedInput: null,
    phase: 'idle' as const,
    result: null,
    error: null,
    validationErrors: {},
    appState: 'active' as const,
  };
}
