from __future__ import annotations

import math
import re
from datetime import date, datetime, time, timedelta
from typing import Any
from urllib.parse import unquote
from zoneinfo import ZoneInfo

from app.clients.errors import UpstreamDecodeError, UpstreamProviderError
from app.clients.http import AsyncJsonClient
from app.core.config import Settings
from app.schemas.travel_plan import (
    Coordinate,
    WeatherCondition,
    WeatherForecast,
    WeatherStatus,
    WeatherSummary,
)

WEATHER_URL = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst"
KST = ZoneInfo("Asia/Seoul")


def latlon_to_grid(coordinate: Coordinate) -> tuple[int, int]:
    """Convert WGS84 coordinates to the KMA Lambert Conformal grid."""

    earth_radius = 6371.00877
    grid_spacing = 5.0
    standard_latitude_1 = 30.0
    standard_latitude_2 = 60.0
    origin_longitude = 126.0
    origin_latitude = 38.0
    origin_x = 43
    origin_y = 136

    pi = math.pi
    re = earth_radius / grid_spacing
    slat1 = standard_latitude_1 * pi / 180
    slat2 = standard_latitude_2 * pi / 180
    olon = origin_longitude * pi / 180
    olat = origin_latitude * pi / 180
    sn = math.log(math.cos(slat1) / math.cos(slat2)) / math.log(
        math.tan(pi * 0.25 + slat2 * 0.5) / math.tan(pi * 0.25 + slat1 * 0.5)
    )
    sf = math.tan(pi * 0.25 + slat1 * 0.5) ** sn * math.cos(slat1) / sn
    ro = re * sf / (math.tan(pi * 0.25 + olat * 0.5) ** sn)

    ra = re * sf / (math.tan(pi * 0.25 + coordinate.lat * pi / 360) ** sn)
    theta = coordinate.lon * pi / 180 - olon
    if theta > pi:
        theta -= 2 * pi
    if theta < -pi:
        theta += 2 * pi
    theta *= sn

    x = math.floor(ra * math.sin(theta) + origin_x + 0.5)
    y = math.floor(ro - ra * math.cos(theta) + origin_y + 0.5)
    return x, y


class WeatherClient:
    def __init__(self, http_client: AsyncJsonClient, settings: Settings) -> None:
        self._http = http_client
        self._settings = settings

    async def get_forecast(
        self,
        coordinate: Coordinate,
        target_date: date,
        *,
        now: datetime | None = None,
    ) -> WeatherSummary:
        checked_at = (now or datetime.now(KST)).astimezone(KST)
        today = checked_at.date()
        if target_date < today:
            return self._summary(
                target_date,
                WeatherStatus.NO_DATA,
                checked_at,
                note="지난 여행일의 단기예보는 제공하지 않습니다.",
            )
        if target_date > today + timedelta(days=3):
            return self._summary(
                target_date,
                WeatherStatus.NOT_YET_PUBLISHED,
                checked_at,
                note="여행일의 단기예보가 아직 발표되지 않았습니다.",
            )

        base_date, base_time = latest_base_time(checked_at)
        nx, ny = latlon_to_grid(coordinate)
        payload = await self._http.get_json(
            "weather",
            WEATHER_URL,
            params={
                "serviceKey": unquote(self._settings.data_go_kr_service_key.get_secret_value()),
                "pageNo": 1,
                "numOfRows": 1000,
                "dataType": "JSON",
                "base_date": base_date.strftime("%Y%m%d"),
                "base_time": base_time,
                "nx": nx,
                "ny": ny,
            },
        )
        body = self._validate_response(payload)
        forecasts = self._forecasts_for_date(body, target_date)
        if not forecasts:
            return self._summary(
                target_date,
                WeatherStatus.NO_DATA,
                checked_at,
                note="예보 제공 범위지만 해당 시간대의 날씨 정보가 없습니다.",
            )
        return self._summary(
            target_date,
            WeatherStatus.AVAILABLE,
            checked_at,
            forecasts=forecasts,
            summary=summarize_forecasts(forecasts),
        )

    @staticmethod
    def _validate_response(payload: dict[str, Any]) -> dict[str, Any]:
        response = payload.get("response")
        if not isinstance(response, dict):
            raise UpstreamDecodeError("weather")
        header = response.get("header")
        body = response.get("body")
        if not isinstance(header, dict) or not isinstance(body, dict):
            raise UpstreamDecodeError("weather")
        if str(header.get("resultCode")) != "00":
            raise UpstreamProviderError("weather", str(header.get("resultCode")))
        return body

    @classmethod
    def _forecasts_for_date(cls, body: dict[str, Any], target_date: date) -> list[WeatherForecast]:
        items = body.get("items")
        if not isinstance(items, dict):
            return []
        raw_items = items.get("item", [])
        if isinstance(raw_items, dict):
            raw_items = [raw_items]
        if not isinstance(raw_items, list):
            raise UpstreamDecodeError("weather")

        grouped: dict[tuple[str, str], dict[str, str]] = {}
        target = target_date.strftime("%Y%m%d")
        for raw in raw_items:
            if not isinstance(raw, dict):
                raise UpstreamDecodeError("weather")
            if str(raw.get("fcstDate")) != target:
                continue
            key = (str(raw.get("fcstDate")), str(raw.get("fcstTime")).zfill(4))
            category = str(raw.get("category"))
            grouped.setdefault(key, {})[category] = str(raw.get("fcstValue", ""))

        forecasts: list[WeatherForecast] = []
        for (forecast_date, forecast_time), values in sorted(grouped.items()):
            try:
                forecast_at = datetime.strptime(
                    f"{forecast_date}{forecast_time}", "%Y%m%d%H%M"
                ).replace(tzinfo=KST)
            except ValueError as exc:
                raise UpstreamDecodeError("weather") from exc
            forecasts.append(
                WeatherForecast(
                    forecastAt=forecast_at,
                    condition=condition_from_values(values),
                    temperatureC=as_float(values.get("TMP")),
                    precipitationProbabilityPercent=as_bounded_float(values.get("POP")),
                    precipitationMm=parse_precipitation(values.get("PCP")),
                )
            )
        return forecasts

    @staticmethod
    def _summary(
        target_date: date,
        status: WeatherStatus,
        checked_at: datetime,
        *,
        forecasts: list[WeatherForecast] | None = None,
        summary: str | None = None,
        note: str | None = None,
    ) -> WeatherSummary:
        return WeatherSummary(
            status=status,
            targetDate=target_date,
            summary=summary,
            forecasts=forecasts or [],
            note=note,
            checkedAt=checked_at,
        )


def latest_base_time(now: datetime) -> tuple[date, str]:
    local_now = now.astimezone(KST)
    available_at = local_now - timedelta(minutes=10)
    release_hours = (2, 5, 8, 11, 14, 17, 20, 23)

    # Compare complete datetimes so that shortly after midnight the previous
    # day's 23:00 release is selected instead of treating 23:00 as a future
    # release on the current date.
    candidates = [
        datetime.combine(
            available_at.date() + timedelta(days=day_offset),
            time(hour=hour),
            tzinfo=KST,
        )
        for day_offset in (-1, 0)
        for hour in release_hours
    ]
    selected = max(candidate for candidate in candidates if candidate <= available_at)
    return selected.date(), selected.strftime("%H%M")


def condition_from_values(values: dict[str, str]) -> WeatherCondition:
    precipitation_type = _as_int(values.get("PTY"))
    if precipitation_type in {1, 2, 3, 4, 5, 6, 7}:
        if precipitation_type in {3, 7}:
            return WeatherCondition.SNOW
        if precipitation_type in {2, 6}:
            return WeatherCondition.RAIN_SNOW
        return WeatherCondition.RAIN
    sky = _as_int(values.get("SKY"))
    if sky is None:
        return WeatherCondition.UNKNOWN
    return {
        1: WeatherCondition.CLEAR,
        3: WeatherCondition.PARTLY_CLOUDY,
        4: WeatherCondition.CLOUDY,
    }.get(sky, WeatherCondition.UNKNOWN)


def summarize_forecasts(forecasts: list[WeatherForecast]) -> str:
    first = forecasts[0]
    labels = {
        WeatherCondition.CLEAR: "맑음",
        WeatherCondition.PARTLY_CLOUDY: "구름 조금",
        WeatherCondition.CLOUDY: "흐림",
        WeatherCondition.RAIN: "비",
        WeatherCondition.SNOW: "눈",
        WeatherCondition.RAIN_SNOW: "비 또는 눈",
        WeatherCondition.UNKNOWN: "날씨 정보 확인 필요",
    }
    return labels[first.condition]


def parse_precipitation(value: str | None) -> float | None:
    if value is None or "없음" in value:
        return 0.0
    numbers = [float(match) for match in re.findall(r"\d+(?:\.\d+)?", value)]
    if not numbers:
        return None
    return sum(numbers) / len(numbers)


def as_float(value: str | None) -> float | None:
    try:
        return float(value) if value is not None else None
    except ValueError:
        return None


def as_bounded_float(value: str | None) -> float | None:
    number = as_float(value)
    return None if number is None else max(0.0, min(100.0, number))


def _as_int(value: str | None) -> int | None:
    try:
        return int(value) if value is not None else None
    except ValueError:
        return None
