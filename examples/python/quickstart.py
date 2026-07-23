"""Python SDK quickstart.

    python examples/python/quickstart.py

Set NORIEN_REGISTRY, NORIEN_ACTOR, and NORIEN_API_KEY to point elsewhere.
"""

from __future__ import annotations

import os
import sys

# Import from the repository checkout so the example runs without installing.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "sdk-python"))

from norien import Norien, NorienError  # noqa: E402


def main() -> int:
    client = Norien(
        os.environ.get("NORIEN_API_KEY"),
        base_url=os.environ.get("NORIEN_REGISTRY", "http://localhost:3000"),
        actor=os.environ.get("NORIEN_ACTOR", "example-user"),
    )

    health = client.health()
    print(f"registry {health['status']} (v{health['version']})\n")

    # --- Search ----------------------------------------------------------
    results = client.search("trading", limit=5)
    print(f"search \"trading\" -> {results['meta']['total']} result(s)")
    for hit in results["data"]:
        item = hit["item"]
        print(f"  {hit['type']:<5} {item['slug']:<18} v{item['version']}")

    # --- Info ------------------------------------------------------------
    agent = client.info("trading-agent")
    print(f"\n{agent['name']} @{agent['version']} by {agent['author']}")
    print(f"  runtime: {agent['runtime']}")
    print(f"  tools:   {', '.join(agent['required_tools'])}")

    # --- Runtime: could this run here? ------------------------------------
    runtime = client.runtime("trading-agent", environment=["EXCHANGE_API_KEY"])
    print(f"\nready: {runtime['ready']}")
    if runtime["environment"]["missing"]:
        print(f"  still needs: {', '.join(runtime['environment']['missing'])}")

    # --- Install ---------------------------------------------------------
    # `^1.0.0` means >=1.0.0 <2.0.0, so this resolves to the highest 1.x.
    installed = client.install("research-agent", version="^1.0.0")
    installation = installed["installation"]
    print(f"\ninstalled {installation['agent']}@{installation['installed_version']}")
    print(f"  start: {installed['runtime']['commands']['start']}")

    # --- Validate before publishing --------------------------------------
    manifest = {
        "name": "Example Python Agent",
        "version": "1.0.0",
        "description": "Created by the Python SDK quickstart example.",
        "runtime": "python",
        "entrypoint": "main.py",
        "tools": ["web-search"],
        "permissions": ["network:fetch"],
        "environment": [{"name": "EXAMPLE_KEY", "required": True, "secret": True}],
        "commands": {"start": "python main.py", "health": "python -m healthcheck"},
    }

    inspection = client.inspect(manifest)
    print(f"\ninspect -> {inspection['slug']}@{inspection['version']}")
    print(f"  action:       {inspection['version_check']['action']}")
    print(f"  dependencies: {'satisfied' if inspection['dependencies']['satisfied'] else 'missing'}")

    # --- Publish ---------------------------------------------------------
    if inspection["version_check"]["acceptable"]:
        published = client.publish(manifest=manifest, tags=["example"])
        agent = published["agent"]
        print(f"\npublished {agent['slug']}@{agent['version']}")
        print(f"  {agent['install_command']}")
    else:
        print(f"\nskipping publish: {inspection['version_check']['conflict_reason']}")

    # --- Paginate --------------------------------------------------------
    python_agents = sum(1 for _ in client.paginate(client.list_agents, runtime="python"))
    print(f"\npython agents in the registry: {python_agents}")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except NorienError as error:
        # Branch on the stable code rather than the message text.
        print(f"[{error.code}] {error.format()}", file=sys.stderr)
        if error.request_id:
            print(f"request id: {error.request_id}", file=sys.stderr)
        raise SystemExit(1)
