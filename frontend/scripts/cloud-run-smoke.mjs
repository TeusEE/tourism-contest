const baseUrl = process.env.CLOUD_RUN_API_BASE_URL?.trim();

if (!baseUrl) {
  console.error("CLOUD_RUN_API_BASE_URL is required");
  process.exitCode = 1;
} else {
  try {
    await runSmoke(new URL(baseUrl));
  } catch (error) {
    console.error(
      `Cloud Run smoke failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    process.exitCode = 1;
  }
}

async function runSmoke(base) {
  if (base.protocol !== "https:" && base.protocol !== "http:") {
    throw new Error("CLOUD_RUN_API_BASE_URL must use http or https");
  }
  if (base.username || base.password || base.search || base.hash) {
    throw new Error(
      "CLOUD_RUN_API_BASE_URL must not contain credentials or query data",
    );
  }
  base.pathname = base.pathname.replace(/\/+$/, "");

  const health = await requestJson(base, "/health");
  assertStatus(health, 200, "health");
  if (!isObject(health.body) || health.body.status !== "ok") {
    throw new Error("health response did not contain status=ok");
  }

  const suggestions = await requestJson(
    base,
    "/api/v1/locations/suggestions?q=%EC%84%9C%EC%9A%B8%EC%97%AD&limit=5",
  );
  assertStatus(suggestions, 200, "suggestions");
  if (
    !isObject(suggestions.body) ||
    !Array.isArray(suggestions.body.items) ||
    suggestions.body.items.length < 1 ||
    !suggestions.body.items.every(isSuggestion)
  ) {
    throw new Error("suggestions response did not match the expected contract");
  }

  const analysis = await requestJson(base, "/api/v1/travel-plan/analyze", {
    method: "POST",
    body: {
      travelDate: tomorrowInKorea(),
      origin: "서울특별시 용산구 한강대로 405",
      destination: "부산광역시 동구 중앙대로 206",
      departureTime: "08:00",
      clientPlatform: "AND",
      eventKeywords: ["축제"],
    },
    timeoutMs: 60_000,
  });
  assertStatus(analysis, 200, "analysis");
  assertAnalysis(analysis.body);

  console.log(
    `Cloud Run smoke passed: health=${health.status} (${health.elapsedMs}ms), suggestions=${suggestions.body.items.length} (${suggestions.elapsedMs}ms), analysis=${analysis.status} (${analysis.elapsedMs}ms)`,
  );
}

async function requestJson(base, pathname, options = {}) {
  const startedAt = performance.now();
  const url = new URL(pathname, `${base.toString().replace(/\/+$/, "")}/`);
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 15_000,
  );
  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    let body;
    try {
      body = await response.json();
    } catch {
      throw new Error(`${pathname} returned non-JSON data`);
    }
    return {
      status: response.status,
      body,
      elapsedMs: Math.round(performance.now() - startedAt),
    };
  } finally {
    clearTimeout(timer);
  }
}

function assertStatus(response, expected, name) {
  if (response.status !== expected) {
    throw new Error(`${name} returned HTTP ${response.status}`);
  }
}

function assertAnalysis(value) {
  const levels = new Set(["high", "medium", "low", "needs-confirmation"]);
  const weatherStatuses = new Set([
    "available",
    "not-yet-published",
    "no-data",
    "failed",
  ]);
  if (
    !isObject(value) ||
    typeof value.travelDate !== "string" ||
    !isObject(value.route) ||
    !Array.isArray(value.route.polyline) ||
    !isObject(value.congestion) ||
    !levels.has(value.congestion.level) ||
    value.congestion.isTrafficPrediction !== false ||
    !Array.isArray(value.events) ||
    !(
      value.nearbyEventCount === null ||
      Number.isInteger(value.nearbyEventCount)
    ) ||
    typeof value.nearbyEventCountIsCapped !== "boolean" ||
    !isObject(value.weather) ||
    !weatherStatuses.has(value.weather.status) ||
    !Array.isArray(value.weather.forecasts) ||
    !Array.isArray(value.warnings) ||
    typeof value.generatedAt !== "string"
  ) {
    throw new Error("analysis response did not match the expected contract");
  }
}

function isSuggestion(value) {
  return (
    isObject(value) &&
    typeof value.name === "string" &&
    (value.address === null || typeof value.address === "string") &&
    (value.roadAddress === null || typeof value.roadAddress === "string") &&
    isCoordinate(value.location)
  );
}

function isCoordinate(value) {
  return (
    isObject(value) &&
    typeof value.lat === "number" &&
    Number.isFinite(value.lat) &&
    value.lat >= -90 &&
    value.lat <= 90 &&
    typeof value.lon === "number" &&
    Number.isFinite(value.lon) &&
    value.lon >= -180 &&
    value.lon <= 180
  );
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tomorrowInKorea() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const date = new Date(
    Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day) + 1,
    ),
  );
  return date.toISOString().slice(0, 10);
}
