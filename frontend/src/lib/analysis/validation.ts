export interface AnalysisInput {
  travelDate: string;
  origin: string;
  destination: string;
  departureTime: string;
  eventKeywords: string[];
}

export type ValidationErrors = Partial<Record<keyof AnalysisInput, string>>;

export function localDateString(offsetDays = 0, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const date = new Date(
    Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day) + offsetDays,
    ),
  );
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function validateAnalysisInput(input: AnalysisInput): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!isValidDateString(input.travelDate)) {
    errors.travelDate = "여행일을 YYYY-MM-DD 형식으로 입력해 주세요.";
  }
  if (!input.origin.trim()) {
    errors.origin = "출발지를 입력해 주세요.";
  } else if (input.origin.trim().length > 200) {
    errors.origin = "출발지는 200자 이내로 입력해 주세요.";
  }
  if (!input.destination.trim()) {
    errors.destination = "여행지를 입력해 주세요.";
  } else if (input.destination.trim().length > 200) {
    errors.destination = "여행지는 200자 이내로 입력해 주세요.";
  }
  if (
    input.departureTime &&
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.departureTime)
  ) {
    errors.departureTime = "출발 시각은 HH:mm 형식으로 입력해 주세요.";
  }
  if (input.eventKeywords.length > 10) {
    errors.eventKeywords = "관심 유형은 최대 10개까지 선택할 수 있습니다.";
  } else if (
    input.eventKeywords.some(
      (keyword) => !keyword.trim() || keyword.trim().length > 40,
    )
  ) {
    errors.eventKeywords = "관심 유형은 1~40자로 입력해 주세요.";
  }
  return errors;
}

export function hasValidationErrors(errors: ValidationErrors): boolean {
  return Object.keys(errors).length > 0;
}
