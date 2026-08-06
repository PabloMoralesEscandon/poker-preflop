"""Domain errors exposed through the HTTP API."""


class LearnerError(Exception):
    """A client-safe error represented by the API's standard envelope."""

    def __init__(
        self,
        *,
        code: str,
        message: str,
        status_code: int,
        field: str | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.field = field


def invalid_config(message: str, field: str) -> LearnerError:
    """Build an invalid-config error with the required offending field."""
    return LearnerError(
        code="invalid_config",
        message=message,
        status_code=400,
        field=field,
    )
