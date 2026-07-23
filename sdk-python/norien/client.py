"""The Norien registry client."""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Iterable, Iterator, List, Mapping, Optional, Sequence, Union

from .errors import NorienError

__all__ = ["Norien", "NorienClient"]

DEFAULT_BASE_URL = "http://localhost:3000"
DEFAULT_TIMEOUT = 30.0
DEFAULT_RETRIES = 2

_RETRYABLE_STATUS = {408, 429, 502, 503, 504}
_IDEMPOTENT_METHODS = {"GET", "HEAD"}

JsonDict = Dict[str, Any]
ProvidedEnvironment = Union[Sequence[str], Mapping[str, str]]


class NorienClient:
    """Client for the Norien agent registry.

    ::

        client = Norien(API_KEY)

        client.search("trading")
        client.info("trading-agent")
        client.install("trading-agent")
        client.publish(manifest=manifest)

    Built on the standard library so the package has no dependencies: it is a
    thin REST client, and staying dependency-free means it installs cleanly
    into any environment.
    """

    #: Grouped tool-marketplace methods: ``client.tools.search(...)`` etc.
    tools: "ToolsNamespace"
    #: Market-data namespaces, backed by the unified ``/api/*`` surface.
    tokens: "TokensNamespace"
    projects: "ProjectsNamespace"
    contracts: "ContractsNamespace"
    wallets: "WalletsNamespace"
    #: Global product search. ``search()`` searches the registry instead.
    market: "MarketSearchNamespace"

    def __init__(
        self,
        api_key: Optional[str] = None,
        *,
        base_url: Optional[str] = None,
        actor: Optional[str] = None,
        timeout: float = DEFAULT_TIMEOUT,
        retries: int = DEFAULT_RETRIES,
        headers: Optional[Mapping[str, str]] = None,
        user_agent: str = "norien-python",
    ) -> None:
        self.base_url = (base_url or os.environ.get("NORIEN_REGISTRY") or DEFAULT_BASE_URL).rstrip("/")
        # Sent as `x-norien-actor`; this is what the registry currently uses to
        # attribute publishes and installs.
        self.actor = actor or os.environ.get("NORIEN_ACTOR")
        self._api_key = api_key or os.environ.get("NORIEN_API_KEY")
        self._timeout = timeout
        self._retries = retries

        self._headers: Dict[str, str] = {
            "accept": "application/json",
            "user-agent": user_agent,
        }
        if headers:
            self._headers.update(headers)
        # Declared by the registry but not yet enforced. Sending it now means
        # no client change is needed when key verification lands.
        if self._api_key:
            self._headers["authorization"] = f"Bearer {self._api_key}"
        if self.actor:
            self._headers["x-norien-actor"] = self.actor

        self.tools = ToolsNamespace(self)
        self.tokens = TokensNamespace(self)
        self.projects = ProjectsNamespace(self)
        self.contracts = ContractsNamespace(self)
        self.wallets = WalletsNamespace(self)
        self.market = MarketSearchNamespace(self)

    # --- Transport --------------------------------------------------------

    def _build_url(self, path: str, params: Optional[Mapping[str, Any]] = None) -> str:
        url = f"{self.base_url}{path}"
        if not params:
            return url

        pairs: List[tuple] = []
        for key, value in params.items():
            if value is None or value == "":
                continue
            if isinstance(value, (list, tuple, set)):
                # Repeated keys, e.g. ?tag=a&tag=b -- what the registry expects.
                pairs.extend((key, str(item)) for item in value if item not in (None, ""))
            elif isinstance(value, bool):
                pairs.append((key, "true" if value else "false"))
            else:
                pairs.append((key, str(value)))

        query = urllib.parse.urlencode(pairs)
        return f"{url}?{query}" if query else url

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Mapping[str, Any]] = None,
        body: Optional[Any] = None,
    ) -> Any:
        url = self._build_url(path, params)
        payload = None if body is None else json.dumps(body).encode("utf-8")

        headers = dict(self._headers)
        if payload is not None:
            headers["content-type"] = "application/json"

        last_error: Optional[Exception] = None

        for attempt in range(self._retries + 1):
            request = urllib.request.Request(url, data=payload, headers=headers, method=method)

            try:
                with urllib.request.urlopen(request, timeout=self._timeout) as response:
                    raw = response.read()
                    if not raw:
                        return None
                    return json.loads(raw.decode("utf-8"))

            except urllib.error.HTTPError as error:
                raw = error.read()
                parsed: Any = None
                if raw:
                    try:
                        parsed = json.loads(raw.decode("utf-8"))
                    except ValueError:
                        parsed = None

                retryable = (
                    error.code in _RETRYABLE_STATUS
                    and method in _IDEMPOTENT_METHODS
                    and attempt < self._retries
                )
                if not retryable:
                    raise _to_norien_error(error.code, parsed, str(error)) from error

                last_error = error

            except urllib.error.URLError as error:
                # A connection failure is worth retrying; a 4xx never is.
                if attempt >= self._retries:
                    raise NorienError(
                        f"Could not reach the registry: {error.reason}",
                        code="NETWORK_ERROR",
                    ) from error
                last_error = error

            # Exponential backoff: 0.2s, 0.4s, 0.8s...
            time.sleep(0.2 * (2**attempt))

        raise NorienError(
            f"Request failed after {self._retries + 1} attempts: {last_error}",
            code="NETWORK_ERROR",
        )

    # --- System -----------------------------------------------------------

    def health(self) -> JsonDict:
        """Liveness and dependency check."""
        return self._request("GET", "/health")

    # --- Discovery --------------------------------------------------------

    def search(
        self,
        q: str,
        *,
        type: str = "all",
        tag: Optional[Iterable[str]] = None,
        category: Optional[str] = None,
        author: Optional[str] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
        strategy: Optional[str] = None,
    ) -> JsonDict:
        """Ranked search across agents and tools."""
        return self._request(
            "GET",
            "/search",
            params={
                "q": q,
                "type": type,
                "tag": list(tag) if tag else None,
                "category": category,
                "author": author,
                "limit": limit,
                "offset": offset,
                "strategy": strategy,
            },
        )

    def info(self, slug: str, *, version: Optional[str] = None) -> JsonDict:
        """Full detail for one agent. ``version`` accepts an exact version or a range."""
        return self._request(
            "GET", f"/agents/{urllib.parse.quote(slug)}", params={"version": version}
        )

    def list_agents(self, **params: Any) -> JsonDict:
        """Paginated agent catalogue. Accepts tag, author, tool, runtime, sort, order."""
        return self._request("GET", "/agents", params=params)

    def list_tools(self, **params: Any) -> JsonDict:
        return self._request("GET", "/tools", params=params)

    def tool(self, slug: str) -> JsonDict:
        return self._request("GET", f"/tools/{urllib.parse.quote(slug)}")

    def versions(self, slug: str, **params: Any) -> JsonDict:
        """Published version history for an agent."""
        return self._request(
            "GET", f"/agents/{urllib.parse.quote(slug)}/versions", params=params
        )

    # --- Runtime ----------------------------------------------------------

    def runtime(self, slug: str, *, environment: Optional[Sequence[str]] = None) -> JsonDict:
        """Normalized runtime view: detected runtime, resolved tools, readiness."""
        return self._request(
            "GET",
            f"/agents/{urllib.parse.quote(slug)}/runtime",
            params={"environment": ",".join(environment) if environment else None},
        )

    def inspect(
        self,
        manifest: Mapping[str, Any],
        *,
        environment: Optional[ProvidedEnvironment] = None,
        slug: Optional[str] = None,
    ) -> JsonDict:
        """Validate an ``agent.json`` without publishing it.

        Structural problems raise; a manifest that parses but cannot be
        satisfied returns ``ready: False`` with the reasons in ``diagnostics``.
        """
        body: JsonDict = {"manifest": dict(manifest)}
        if environment is not None:
            body["environment"] = list(environment) if not isinstance(environment, Mapping) else dict(environment)
        if slug is not None:
            body["slug"] = slug
        return self._request("POST", "/runtime/inspect", body=body)

    # --- Lifecycle --------------------------------------------------------

    def install(
        self,
        agent: str,
        *,
        version: Optional[str] = None,
        environment: Optional[ProvidedEnvironment] = None,
    ) -> JsonDict:
        """Install an agent and return everything needed to run it."""
        body: JsonDict = {"agent": agent}
        if version is not None:
            body["version"] = version
        if environment is not None:
            body["environment"] = list(environment) if not isinstance(environment, Mapping) else dict(environment)
        return self._request("POST", "/install", body=body)

    def uninstall(self, agent: str) -> None:
        self._request("POST", "/uninstall", body={"agent": agent})

    def installations(self, **params: Any) -> JsonDict:
        return self._request("GET", "/installations", params=params)

    # --- Publishing -------------------------------------------------------

    def publish(
        self,
        payload: Optional[Mapping[str, Any]] = None,
        *,
        manifest: Optional[Mapping[str, Any]] = None,
        **fields: Any,
    ) -> JsonDict:
        """Publish an agent or a tool.

        Creates on first publish and appends an immutable version thereafter.
        The type is inferred when unambiguous (a ``manifest`` implies an agent;
        ``input_schema`` implies a tool).
        """
        body: JsonDict = dict(payload) if payload else {}
        if manifest is not None:
            body["manifest"] = dict(manifest)
        body.update(fields)

        if not body:
            raise ValueError("publish() requires a payload, a manifest, or keyword fields.")

        return self._request("POST", "/publish", body=body)

    def update_agent(self, slug: str, **fields: Any) -> JsonDict:
        """Patch agent metadata. Published versions are immutable."""
        return self._request("PATCH", f"/agents/{urllib.parse.quote(slug)}", body=fields)

    def delete_agent(self, slug: str) -> None:
        self._request("DELETE", f"/agents/{urllib.parse.quote(slug)}")

    def create_tool(self, **fields: Any) -> JsonDict:
        return self._request("POST", "/tools", body=fields)

    def update_tool(self, slug: str, **fields: Any) -> JsonDict:
        return self._request("PATCH", f"/tools/{urllib.parse.quote(slug)}", body=fields)

    def delete_tool(self, slug: str) -> None:
        self._request("DELETE", f"/tools/{urllib.parse.quote(slug)}")

    # --- Helpers ----------------------------------------------------------

    def paginate(self, fetch: Any, page_size: int = 50, **params: Any) -> Iterator[JsonDict]:
        """Walk every page of a paginated endpoint.

        ::

            for agent in client.paginate(client.list_agents, runtime="python"):
                print(agent["slug"])
        """
        offset = 0
        while True:
            page = fetch(limit=page_size, offset=offset, **params)
            for item in page.get("data", []):
                yield item

            meta = page.get("meta", {})
            # Trust the server's cursor rather than recomputing it here.
            if not meta.get("has_more") or meta.get("next_offset") is None:
                return
            offset = meta["next_offset"]

    def __repr__(self) -> str:
        return f"Norien(base_url={self.base_url!r}, actor={self.actor!r})"


class ToolsNamespace:
    """Grouped tool-marketplace methods.

    Mirrors the TypeScript SDK's ``client.tools`` so the two read the same::

        client.tools.search("wallet")
        client.tools.info("http-client")
        client.tools.install("http-client")
        client.tools.publish(manifest)
    """

    def __init__(self, client: "NorienClient") -> None:
        self._client = client

    def list(self, **params: Any) -> JsonDict:
        return self._client._request("GET", "/tools", params=params)

    def search(
        self,
        q: str,
        *,
        category: Optional[str] = None,
        runtime: Optional[str] = None,
        tag: Optional[Iterable[str]] = None,
        author: Optional[str] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> JsonDict:
        """Ranked marketplace search restricted to tools."""
        return self._client._request(
            "GET",
            "/tools/search",
            params={
                "q": q,
                "category": category,
                "runtime": runtime,
                "tag": list(tag) if tag else None,
                "author": author,
                "limit": limit,
                "offset": offset,
            },
        )

    def info(self, slug: str) -> JsonDict:
        """Full detail for one tool."""
        return self._client._request("GET", f"/tools/{urllib.parse.quote(slug)}")

    def versions(self, slug: str, **params: Any) -> JsonDict:
        return self._client._request(
            "GET", f"/tools/{urllib.parse.quote(slug)}/versions", params=params
        )

    def publish(
        self,
        payload: Optional[Mapping[str, Any]] = None,
        **fields: Any,
    ) -> JsonDict:
        """Publish or version a tool from a tool.json manifest."""
        body: JsonDict = dict(payload) if payload else {}
        body.update(fields)
        if not body:
            raise ValueError("publish() requires a manifest payload or keyword fields.")
        return self._client._request("POST", "/tools/publish", body=body)

    def install(self, slug: str, *, version: Optional[str] = None) -> JsonDict:
        """Resolve a tool for installation: manifest plus dependency tools."""
        body: JsonDict = {"tool": slug}
        if version is not None:
            body["version"] = version
        return self._client._request("POST", "/tools/install", body=body)

    def update(self, slug: str, **fields: Any) -> JsonDict:
        return self._client._request(
            "PATCH", f"/tools/{urllib.parse.quote(slug)}", body=fields
        )

    def remove(self, slug: str) -> None:
        self._client._request("DELETE", f"/tools/{urllib.parse.quote(slug)}")




class TokensNamespace:
    """Market data for tokens, from the unified ``/api/*`` surface."""

    def __init__(self, client: "NorienClient") -> None:
        self._client = client

    def list(self, **params: Any) -> JsonDict:
        """Ranked token listing. Accepts limit, offset, sort, q, chainId."""
        return self._client._request("GET", "/api/tokens", params=params)

    def trending(self, **params: Any) -> JsonDict:
        return self._client._request("GET", "/api/trending", params=params)

    def get(self, address: str, *, chain_id: Optional[int] = None) -> JsonDict:
        return self._client._request(
            "GET",
            f"/api/token/{urllib.parse.quote(address)}",
            params={"chainId": chain_id},
        )


class ProjectsNamespace:
    """Ecosystem projects and their TVL."""

    def __init__(self, client: "NorienClient") -> None:
        self._client = client

    def list(self, **params: Any) -> JsonDict:
        return self._client._request("GET", "/api/projects", params=params)

    def get(self, slug: str) -> JsonDict:
        return self._client._request("GET", f"/api/project/{urllib.parse.quote(slug)}")


class ContractsNamespace:
    """On-chain contracts: ABI, verified source, creator."""

    def __init__(self, client: "NorienClient") -> None:
        self._client = client

    def get(self, address: str) -> JsonDict:
        return self._client._request("GET", f"/api/contracts/{urllib.parse.quote(address)}")


class WalletsNamespace:
    """Wallet balances, transactions, and token transfers."""

    def __init__(self, client: "NorienClient") -> None:
        self._client = client

    def get(self, address: str, *, limit: Optional[int] = None) -> JsonDict:
        return self._client._request(
            "GET",
            f"/api/wallets/{urllib.parse.quote(address)}",
            params={"limit": limit},
        )


class MarketSearchNamespace:
    """Global product search across tokens, projects, and addresses."""

    def __init__(self, client: "NorienClient") -> None:
        self._client = client

    def all(self, query: str, *, limit: Optional[int] = None) -> JsonDict:
        return self._client._request(
            "GET", "/api/search", params={"q": query, "limit": limit}
        )


class ChainNamespace:
    """Chain status and provider health."""

    def __init__(self, client: "NorienClient") -> None:
        self._client = client

    def status(self) -> JsonDict:
        return self._client._request("GET", "/api/chain")

    def providers(self) -> JsonDict:
        return self._client._request("GET", "/api/providers")


def _to_norien_error(status: int, parsed: Any, fallback: str) -> NorienError:
    if isinstance(parsed, dict) and isinstance(parsed.get("error"), dict):
        envelope = parsed["error"]
        return NorienError(
            envelope.get("message", fallback),
            code=envelope.get("code", "HTTP_ERROR"),
            status=status,
            details=envelope.get("details") or [],
            request_id=envelope.get("request_id"),
        )

    return NorienError(fallback, code="HTTP_ERROR", status=status)


#: Ergonomic alias, so ``Norien(API_KEY)`` reads the same as the TypeScript SDK.
Norien = NorienClient
