"""Official Python SDK for the Norien agent registry.

::

    from norien import Norien

    client = Norien(API_KEY)

    client.search("trading")
    client.info("trading-agent")
    client.install("trading-agent")
    client.publish(manifest=manifest)
"""

from .client import (
    DEFAULT_BASE_URL,
    ContractsNamespace,
    MarketSearchNamespace,
    Norien,
    NorienClient,
    ProjectsNamespace,
    TokensNamespace,
    ToolsNamespace,
    WalletsNamespace,
)
from .errors import NorienError

__all__ = [
    "Norien",
    "NorienClient",
    "NorienError",
    "ToolsNamespace",
    "TokensNamespace",
    "ProjectsNamespace",
    "ContractsNamespace",
    "WalletsNamespace",
    "MarketSearchNamespace",
    "DEFAULT_BASE_URL",
    "__version__",
]
__version__ = "0.1.0"
