import { describe, expect, it } from '@jest/globals';

import {
  hasValidationErrors,
  isValidDateString,
  type AnalysisInput,
  validateAnalysisInput,
} from './validation';

const validInput: AnalysisInput = {
  travelDate: '2026-10-03',
  origin: '서울역',
  destination: '부산 해운대',
  departureTime: '08:00',
  eventKeywords: ['축제'],
};

describe('analysis input validation', () => {
  it('accepts valid date and location inputs', () => {
    expect(isValidDateString('2026-10-03')).toBe(true);
    expect(hasValidationErrors(validateAnalysisInput(validInput))).toBe(false);
  });

  it('rejects impossible dates, blank locations, and invalid times', () => {
    const errors = validateAnalysisInput({
      ...validInput,
      travelDate: '2026-02-30',
      origin: ' ',
      destination: 'x'.repeat(201),
      departureTime: '25:61',
    });
    expect(errors.travelDate).toBeDefined();
    expect(errors.origin).toBeDefined();
    expect(errors.destination).toBeDefined();
    expect(errors.departureTime).toBeDefined();
  });

  it('caps event keyword count and item length', () => {
    const errors = validateAnalysisInput({
      ...validInput,
      eventKeywords: [...Array.from({ length: 11 }, () => '축제'), 'x'.repeat(41)],
    });
    expect(errors.eventKeywords).toBeDefined();
  });
});
