from __future__ import annotations

import math

from pyproj import CRS, Transformer
from shapely.geometry import LineString, Point

from app.domain.models import RouteData
from app.schemas.travel_plan import Coordinate

WGS84 = CRS.from_epsg(4326)


def simplify_route(points: list[Coordinate], tolerance_meters: float = 500.0) -> list[Coordinate]:
    unique = _deduplicate_consecutive(points)
    if len(unique) <= 2:
        return unique
    reference = unique[0]
    transformer, inverse = _local_transformers(reference)
    projected = [transformer.transform(point.lon, point.lat) for point in unique]
    simplified = LineString(projected).simplify(tolerance_meters, preserve_topology=False)
    coordinates = [
        Coordinate(lat=lat, lon=lon)
        for lon, lat in (inverse.transform(x, y) for x, y in simplified.coords)
    ]
    if coordinates[0] != unique[0]:
        coordinates.insert(0, unique[0])
    if coordinates[-1] != unique[-1]:
        coordinates.append(unique[-1])
    return coordinates


def generate_search_points(
    route: RouteData,
    max_points: int,
    *,
    spacing_meters: float = 15_000.0,
) -> list[Coordinate]:
    if max_points <= 0:
        return []
    if max_points == 1:
        return [route.destination]
    simplified = simplify_route(route.polyline)
    if not simplified:
        return [route.destination]

    route_budget = max(1, max_points - 1)
    line, transformer, inverse = _projected_line(simplified)
    length = line.length
    desired_count = max(2, math.ceil(length / spacing_meters) + 1) if length else 1
    sample_count = min(route_budget, desired_count)
    if sample_count == 1:
        sampled = [route.origin]
    elif sample_count == 2:
        sampled = [route.origin, route.destination]
    else:
        sampled = []
        for index in range(sample_count):
            distance = length * index / (sample_count - 1) if length else 0
            x, y = line.interpolate(distance).coords[0]
            lon, lat = inverse.transform(x, y)
            sampled.append(Coordinate(lat=lat, lon=lon))

    points = _deduplicate_consecutive(sampled)
    if not any(_same_coordinate(point, route.destination) for point in points):
        points.append(route.destination)
    return points[:max_points]


def distance_to_route_meters(point: Coordinate, route_points: list[Coordinate]) -> int:
    if not route_points:
        return 0
    line, transformer, _ = _projected_line(route_points)
    x, y = transformer.transform(point.lon, point.lat)
    distance = line.distance(Point(x, y))
    return max(0, int(round(float(distance))))


def distance_between_points_meters(first: Coordinate, second: Coordinate) -> int:
    transformer, _ = _local_transformers(first)
    first_x, first_y = transformer.transform(first.lon, first.lat)
    second_x, second_y = transformer.transform(second.lon, second.lat)
    return max(0, round(math.hypot(second_x - first_x, second_y - first_y)))


def _projected_line(points: list[Coordinate]) -> tuple[LineString, Transformer, Transformer]:
    unique = _deduplicate_consecutive(points)
    reference = unique[0]
    transformer, inverse = _local_transformers(reference)
    projected = [transformer.transform(point.lon, point.lat) for point in unique]
    if len(projected) == 1:
        projected.append(projected[0])
    return LineString(projected), transformer, inverse


def _local_transformers(reference: Coordinate) -> tuple[Transformer, Transformer]:
    local_crs = CRS.from_proj4(
        f"+proj=aeqd +lat_0={reference.lat} +lon_0={reference.lon} "
        "+datum=WGS84 +units=m +no_defs"
    )
    return (
        Transformer.from_crs(WGS84, local_crs, always_xy=True),
        Transformer.from_crs(local_crs, WGS84, always_xy=True),
    )


def _deduplicate_consecutive(points: list[Coordinate]) -> list[Coordinate]:
    unique: list[Coordinate] = []
    for point in points:
        if not unique or not _same_coordinate(unique[-1], point):
            unique.append(point)
    return unique


def _same_coordinate(first: Coordinate, second: Coordinate) -> bool:
    return abs(first.lat - second.lat) < 1e-9 and abs(first.lon - second.lon) < 1e-9
