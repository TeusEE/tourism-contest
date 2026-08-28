"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { RouteMapPreview } from "@/components/route-map-preview";
import { useAnalysis } from "@/lib/analysis/context";
import type {
  EventSummary,
  VisitorReference,
  Warning,
  WeatherForecast,
  WeatherSummary,
} from "@/lib/api/contracts";
import {
  apiErrorTitle,
  congestionLabels,
  congestionTones,
  formatCheckedAt,
  formatDistance,
  formatDuration,
  formatEventCount,
  visitorStatusLabel,
  warningTitle,
  weatherConditionLabel,
  weatherStatusLabel,
} from "@/lib/ui/presentation";

export function ResultsState() {
  const router = useRouter();
  const { state, cancel, reset, retryAnalysis } = useAnalysis();

  if (state.phase === "loading") {
    return (
      <div className="page-shell page-shell--narrow">
        <section
          className="state-panel"
          aria-live="polite"
          aria-labelledby="loading-title"
          role="status"
        >
          <div className="loading-indicator" aria-hidden="true" />
          <p className="eyebrow">ANALYSIS IN PROGRESS</p>
          <h1 id="loading-title">여행 주변을 살펴보고 있어요</h1>
          <p>자동차 경로와 행사·방문객·날씨 정보를 함께 조회하고 있습니다.</p>
          <button
            className="button button--danger"
            type="button"
            onClick={() => cancel()}
          >
            분석 취소
          </button>
        </section>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="page-shell page-shell--narrow">
        <section className="state-panel" aria-labelledby="error-title">
          <p className="eyebrow eyebrow--danger">ANALYSIS UNAVAILABLE</p>
          <h1 id="error-title">분석을 완료하지 못했어요</h1>
          <StatusCard
            title={apiErrorTitle(state.error?.code ?? null)}
            message={
              state.error?.message ??
              "입력 내용을 확인한 후 다시 시도해 주세요."
            }
            tone="danger"
            role="alert"
          />
          {state.error?.fields.length ? (
            <ul className="field-error-list" aria-label="입력 오류">
              {state.error.fields.map((field) => (
                <li key={`${field.field}-${field.code}`}>{field.message}</li>
              ))}
            </ul>
          ) : null}
          <div className="button-stack">
            <Link className="button button--primary" href="/">
              입력으로 돌아가기
            </Link>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => void retryAnalysis()}
            >
              다시 시도
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => reset()}
            >
              상태 초기화
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (state.phase === "cancelled") {
    return (
      <div className="page-shell page-shell--narrow">
        <section
          className="state-panel"
          aria-labelledby="cancelled-title"
          role="status"
        >
          <p className="eyebrow">ANALYSIS CANCELLED</p>
          <h1 id="cancelled-title">분석을 취소했어요</h1>
          <p>필요한 경우 입력 화면에서 다시 분석할 수 있습니다.</p>
          <Link className="button button--primary" href="/">
            입력으로 돌아가기
          </Link>
        </section>
      </div>
    );
  }

  if (state.phase !== "success" || !state.result) {
    return (
      <div className="page-shell page-shell--narrow">
        <section className="state-panel" aria-labelledby="empty-title">
          <p className="eyebrow">ANALYSIS RESULT</p>
          <h1 id="empty-title">분석할 여행 계획이 없어요</h1>
          <p>여행 계획을 입력하면 이곳에서 분석 결과를 확인할 수 있습니다.</p>
          <Link className="button button--primary" href="/">
            여행 계획 입력하기
          </Link>
        </section>
      </div>
    );
  }

  const { result } = state;
  const startNewPlan = () => {
    reset();
    router.push("/");
  };

  return (
    <div className="page-shell">
      <div className="result-heading">
        <div>
          <p className="eyebrow">ANALYSIS RESULT</p>
          <h1>{result.travelDate} 여행 참고 정보</h1>
        </div>
        <button
          className="button button--ghost"
          type="button"
          onClick={startNewPlan}
        >
          새 분석
        </button>
      </div>

      <section
        className={`congestion-card congestion-card--${congestionTones[result.congestion.level]}`}
        aria-labelledby="congestion-title"
      >
        <div className="congestion-card__heading">
          <h2 id="congestion-title">
            목적지 주변 행사 밀집 가능성{" "}
            {congestionLabels[result.congestion.level]}
          </h2>
          <span>행사 개수 기반 · 교통 지연 예측 아님</span>
        </div>
        <p>{result.congestion.summary}</p>
        {result.congestion.reasons.slice(0, 3).length > 0 ? (
          <ul className="reason-list">
            {result.congestion.reasons.slice(0, 3).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <RouteMapPreview events={result.events} route={result.route} />

      <section className="metric-grid" aria-label="분석 요약">
        <Metric
          label="자동차 경로"
          value={formatDistance(result.route.distanceMeters)}
        />
        <Metric
          label="일반 예상 이동시간"
          value={formatDuration(result.route.durationSeconds)}
        />
        <Metric
          label="목적지 주변 행사"
          value={formatEventCount(
            result.nearbyEventCount,
            result.nearbyEventCountIsCapped,
          )}
        />
      </section>

      <EventSection
        count={result.nearbyEventCount}
        countIsCapped={result.nearbyEventCountIsCapped}
        events={result.events}
      />
      <Warnings warnings={result.warnings} />
      <VisitorCard reference={result.visitorReference} />
      <WeatherCard weather={result.weather} />

      <section className="disclaimer-card" aria-label="데이터 안내">
        <h2>데이터 안내</h2>
        <p>
          행사 개수는 확인 시점의 공식 후보 데이터입니다. 행사별 상세정보는
          제공되는 경우에만 표시하며, 방문객 수는 과거 참고값으로 미래 방문객 수
          예측이 아닙니다. 일부 제공자 장애 시 확인 가능한 정보만 표시합니다.
        </p>
      </section>

      <button
        className="button button--secondary button--wide"
        type="button"
        onClick={startNewPlan}
      >
        새 여행 계획 분석하기
      </button>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EventSection({
  count,
  countIsCapped,
  events,
}: {
  count: number | null;
  countIsCapped: boolean;
  events: EventSummary[];
}) {
  return (
    <section className="result-section" aria-labelledby="events-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker">NEARBY EVENTS</p>
          <h2 id="events-title">목적지 주변 행사</h2>
        </div>
        <span className="section-trailing">
          {formatEventCount(count, countIsCapped)}
        </span>
      </div>
      {events.length === 0 ? (
        <StatusCard
          title={
            count === null
              ? "행사 밀집 가능성 확인 필요"
              : `${formatEventCount(count, countIsCapped)} 후보 확인`
          }
          message={
            count === null
              ? "행사 제공자 응답이 없어 행사 개수와 밀집 가능성을 확인할 수 없습니다."
              : count === 0
                ? "여행일과 목적지 반경 조건에 맞는 행사 후보가 없습니다."
                : "현재 단계에서는 행사 개수만 확인했습니다. 행사별 상세정보는 제공되는 경우에만 표시합니다."
          }
          tone={count === null ? "warning" : "info"}
        />
      ) : (
        <div className="event-list">
          {events.map((event) => (
            <EventCard event={event} key={event.id} />
          ))}
        </div>
      )}
    </section>
  );
}

function EventCard({ event }: { event: EventSummary }) {
  const distance =
    event.distanceToRouteMeters ?? event.distanceToDestinationMeters;
  const locationText = event.venue ?? event.address;

  return (
    <article className="event-card">
      <div className="event-card__heading">
        <div>
          <p className="event-card__type">{eventTypeLabel(event.eventType)}</p>
          <h3>{event.title}</h3>
        </div>
        <span
          className={`status-badge status-badge--${event.congestionSignal}`}
        >
          {congestionLabels[event.congestionSignal]}
        </span>
      </div>
      <p className="event-card__date">
        {event.startDate === event.endDate
          ? event.startDate
          : `${event.startDate} ~ ${event.endDate}`}
      </p>
      {locationText ? <p>{locationText}</p> : null}
      <p>
        {distance !== null
          ? `자동차 경로에서 약 ${formatDistance(distance)}`
          : "행사장 좌표를 확인할 수 없어 추가 확인이 필요합니다."}
      </p>
      <div className="event-card__footer">
        <span>
          {event.sourceName} · {confidenceLabel(event.confidence)} · 확인 시각{" "}
          {formatCheckedAt(event.checkedAt)}
        </span>
        {event.sourceUrl && isHttpUrl(event.sourceUrl) ? (
          <a
            className="text-link"
            href={event.sourceUrl}
            rel="noreferrer"
            target="_blank"
          >
            공식 출처 열기
          </a>
        ) : null}
      </div>
      {event.status !== "confirmed" ? (
        <p className="event-card__status">{eventStatusLabel(event.status)}</p>
      ) : null}
    </article>
  );
}

function Warnings({ warnings }: { warnings: Warning[] }) {
  if (warnings.length === 0) return null;
  return (
    <section className="result-section" aria-labelledby="warnings-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker">DATA NOTES</p>
          <h2 id="warnings-title">확인할 안내</h2>
        </div>
        <span className="section-trailing">{warnings.length}건</span>
      </div>
      <div className="warning-list">
        {warnings.map((warning, index) => (
          <StatusCard
            key={`${warning.code}-${warning.eventId ?? "all"}-${index}`}
            title={warningTitle(warning.code)}
            message={warning.message}
            tone={warning.severity === "warning" ? "warning" : "info"}
          />
        ))}
      </div>
    </section>
  );
}

function VisitorCard({ reference }: { reference: VisitorReference | null }) {
  if (!reference) {
    return (
      <section className="result-section" aria-labelledby="visitor-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker">VISITOR REFERENCE</p>
            <h2 id="visitor-title">방문객 참고값</h2>
          </div>
        </div>
        <StatusCard
          title="방문객 정보 없음"
          message="방문객 참고값을 반환하지 않았습니다."
          tone="info"
        />
      </section>
    );
  }

  return (
    <section className="result-section" aria-labelledby="visitor-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker">VISITOR REFERENCE</p>
          <h2 id="visitor-title">방문객 참고값</h2>
        </div>
        <span className={`status-badge status-badge--${reference.status}`}>
          {visitorStatusLabel(reference.status)}
        </span>
      </div>
      <div className="data-card">
        <strong className="data-card__title">
          {visitorTitle(reference.status)}
        </strong>
        <div className="data-card__value">
          {reference.visitorCount !== null
            ? `${reference.visitorCount.toLocaleString("ko-KR")}명`
            : "확인 필요"}
        </div>
        {reference.concentrationRate !== null ? (
          <p>관광지 상대 집중률 {reference.concentrationRate.toFixed(1)}%</p>
        ) : null}
        <p>
          기준일 {reference.referenceDate ?? "확인 불가"} ·{" "}
          {reference.region ?? "지역 확인 불가"}
        </p>
        <p className="data-card__note">{reference.note}</p>
        <p className="data-card__source">출처: {reference.sourceName}</p>
      </div>
    </section>
  );
}

function WeatherCard({ weather }: { weather: WeatherSummary }) {
  return (
    <section className="result-section" aria-labelledby="weather-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker">WEATHER</p>
          <h2 id="weather-title">여행지 날씨</h2>
        </div>
        <span className={`status-badge status-badge--${weather.status}`}>
          {weatherStatusLabel(weather.status)}
        </span>
      </div>
      <div className="data-card">
        <div className="data-card__meta-row">
          <strong>{weather.targetDate}</strong>
          <span>확인 시각 {formatCheckedAt(weather.checkedAt)}</span>
        </div>
        <p className="weather-summary">
          {weather.summary ??
            `${weatherStatusLabel(weather.status)} 상태입니다.`}
        </p>
        {weather.forecasts.slice(0, 6).length > 0 ? (
          <div className="forecast-list" aria-label="시간대별 날씨">
            {weather.forecasts.slice(0, 6).map((forecast) => (
              <ForecastRow forecast={forecast} key={forecast.forecastAt} />
            ))}
          </div>
        ) : null}
        <p className="data-card__note">
          {weather.note ?? "기상청 단기예보 기준입니다."}
        </p>
      </div>
    </section>
  );
}

function ForecastRow({ forecast }: { forecast: WeatherForecast }) {
  return (
    <div className="forecast-row">
      <strong>{formatForecastTime(forecast.forecastAt)}</strong>
      <span>{weatherConditionLabel(forecast.condition)}</span>
      <span>
        {forecast.temperatureC !== null
          ? `${forecast.temperatureC}°`
          : "기온 —"}
      </span>
      <span>
        강수{" "}
        {forecast.precipitationProbabilityPercent !== null
          ? `${forecast.precipitationProbabilityPercent}%`
          : "—"}
      </span>
    </div>
  );
}

function StatusCard({
  title,
  message,
  tone,
  role,
}: {
  title: string;
  message: string;
  tone: "info" | "success" | "warning" | "danger";
  role?: "alert" | "status";
}) {
  return (
    <div className={`status-card status-card--${tone}`} role={role}>
      <strong>{title}</strong>
      <span>{message}</span>
    </div>
  );
}

function visitorTitle(status: VisitorReference["status"]): string {
  return {
    available: "방문객 참고값",
    "no-data": "방문객 데이터 없음",
    failed: "방문객 조회 실패",
  }[status];
}

function eventTypeLabel(value: EventSummary["eventType"]): string {
  return {
    festival: "축제",
    performance: "공연",
    sports: "스포츠",
    other: "기타 행사",
  }[value];
}

function confidenceLabel(value: EventSummary["confidence"]): string {
  return {
    high: "신뢰도 높음",
    medium: "신뢰도 보통",
    low: "확인 필요",
  }[value];
}

function eventStatusLabel(value: EventSummary["status"]): string {
  return {
    candidate: "후보 행사",
    changed: "변경 가능",
    cancelled: "취소됨",
    confirmed: "확정",
  }[value];
}

function formatForecastTime(value: string): string {
  const match = /T(\d{2}:\d{2})/.exec(value);
  return match?.[1] ?? value;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
