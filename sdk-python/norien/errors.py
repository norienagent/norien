"""Error types mirroring the registry's single error envelope."""

from __future__ import annotations

from typing import Any, Dict, List, Optional


class NorienError(Exception):
    """A failed registry call.

    The registry returns one envelope for every failure::

        {"error": {"code", "message", "details": [...], "request_id"}}

    All of it is preserved here so callers can branch on a stable ``code``
    rather than matching on message text, and can quote ``request_id`` in a
    bug report.
    """

    def __init__(
        self,
        message: str,
        *,
        code: str = "UNKNOWN",
        status: Optional[int] = None,
        details: Optional[List[Dict[str, Any]]] = None,
        request_id: Optional[str] = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status = status
        self.details = details or []
        self.request_id = request_id

    @property
    def is_network_error(self) -> bool:
        """True when the registry could not be reached at all."""
        return self.status is None and self.code == "NETWORK_ERROR"

    @property
    def is_not_found(self) -> bool:
        return self.status == 404

    @property
    def is_conflict(self) -> bool:
        return self.status == 409

    @property
    def is_unauthorized(self) -> bool:
        return self.status in (401, 403)

    @property
    def is_validation_error(self) -> bool:
        return self.status == 422

    def format(self) -> str:
        """Multi-line rendering: the message plus each field-scoped detail."""
        lines = [self.message]
        for detail in self.details:
            field = detail.get("field")
            text = detail.get("message", "")
            lines.append(f"  {field}: {text}" if field else f"  {text}")
        return "\n".join(lines)

    def __str__(self) -> str:
        return self.format()

    def __repr__(self) -> str:
        return f"NorienError(code={self.code!r}, status={self.status!r}, message={self.message!r})"
