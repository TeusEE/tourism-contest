from pydantic import Field

from app.schemas.travel_plan import ContractModel


class FieldError(ContractModel):
    field: str
    code: str
    message: str


class ErrorDetail(ContractModel):
    code: str
    message: str
    fields: list[FieldError] = Field(default_factory=list)


class ErrorResponse(ContractModel):
    request_id: str = Field(alias="requestId")
    error: ErrorDetail
