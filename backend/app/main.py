from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.errors import install_exception_handlers
from app.api.routes.health import router as health_router
from app.api.routes.locations import router as locations_router
from app.api.routes.travel_plan import router as travel_plan_router
from app.clients.http import AsyncJsonClient
from app.clients.naver import NaverMapsClient
from app.clients.visitkorea import VisitKoreaClient
from app.clients.visitor import VisitorClient
from app.clients.weather import WeatherClient
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.middleware import RequestContextMiddleware
from app.services.analyzer import TravelPlanAnalyzer


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Validate required environment variables before the service accepts traffic.
    settings = get_settings()
    configure_logging(settings.log_level)
    app.state.settings = settings
    http_client = AsyncJsonClient(settings)
    app.state.http_client = http_client
    maps_client = NaverMapsClient(http_client, settings)
    app.state.location_searcher = maps_client
    app.state.analyzer = TravelPlanAnalyzer(
        settings,
        maps_client,
        maps_client,
        VisitKoreaClient(http_client, settings),
        VisitorClient(http_client, settings),
        WeatherClient(http_client, settings),
    )
    try:
        yield
    finally:
        await http_client.aclose()


app = FastAPI(
    title="Travel Congestion Backend",
    description="Stateless analysis API for route-adjacent events and congestion signals.",
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(RequestContextMiddleware)
app.include_router(health_router)
app.include_router(locations_router)
app.include_router(travel_plan_router)
install_exception_handlers(app)
