# Example Tools

Twelve production-ready marketplace tools. Each is a self-contained plugin: a
`tool.json` manifest plus an entrypoint that speaks the Norien tool protocol.

## The plugin protocol (node / python)

A tool reads one JSON document from **stdin**:

```json
{ "input": { ... }, "context": { "tool": "...", "permissions": [ ... ] } }
```

and writes one JSON document to **stdout**:

```json
{ "output": { ... } }        // success
{ "error": { "message": "" } } // failure
```

Everything else the tool logs must go to **stderr**. `http` tools need no local
code — their entrypoint is the URL to call.

## Running them

```bash
# node/python tools carry code, so install from the local path:
norien tool install ./examples/tools/http-client
echo '{"url":"https://api.github.com/zen"}' | norien tool run http-client

# http tools run straight from a registry install:
norien tool publish            # from inside examples/tools/github
norien tool install github
echo '{"owner":"nodejs","repo":"node"}' | norien tool run github
```

| Tool | Runtime | Runnable offline | Notes |
| --- | --- | --- | --- |
| web-search | http | needs network | DuckDuckGo instant-answer API, keyless |
| http-client | node | yes | general HTTP requests |
| filesystem | node | yes | sandboxed read/write/list |
| wallet | node | needs RPC | EVM balance via JSON-RPC |
| discord | node | needs webhook | posts via a Discord webhook |
| telegram | node | needs token | Bot API sendMessage |
| github | http | needs network | GitHub REST, keyless (rate-limited) |
| browser | node | needs network | fetch + extract title/text |
| web-scraper | node | needs network | extract links/text/title |
| email | node | needs provider | posts to an email HTTP API |
| logger | node | yes | structured append-only logging |
| scheduler | node | yes | computes upcoming run times |
