# CLAUDE.md - modules/ai

MCP (Model Context Protocol) server for AI-powered SEPAL recipe interaction via chat.

## Commands

```bash
npm test              # Jest
npm run testWatch     # Jest watch mode
```

## Key Architecture

### Two-Layer Design

**MCP Tool Layer** (`src/mcp/`) — Stateless, testable tool definitions and recipe schema registry. No LLM dependency. Communicates with sepal-server (recipe CRUD) and gee module (recipe execution) via HTTP.

**Chat Orchestrator Layer** (`src/chat/`) — Manages chat sessions, LLM provider abstraction, conversation history, and websocket communication with the GUI. Calls MCP tools internally based on LLM tool-calling decisions.

### Entry Point
`src/main.js` — Koa HTTP server with WebSocket support via `#sepal/httpServer` `wsStream()`. Initializes registry, API clients, tools, schemas, templates, and the websocket handler.

### WebSocket Protocol
Uses the gateway's subscription-based websocket routing. The browser subscribes to `ai` module, and messages flow as `{module, subscriptionId, data}`.

- **Lifecycle events**: `subscriptionUp/Down`, `clientUp/Down`, `userUp/Down` — handled for session management
- **Chat messages**: `{type: 'message', text}` from client → LLM processing → `{type: 'chat-response', text, complete}` back (final chunk includes `complete: true`)
- **GUI actions**: `{type: 'gui-action', action: 'open'|'reload'|'close', recipeId}` sent to client

### REST API
- `GET /healthcheck` — Returns `{status: 'ok'}`

## Source Structure

```
src/
  main.js                     # Entry point, wires everything together
  config.js                   # CLI argument parsing (port, endpoints, LLM config)
  routes.js                   # HTTP + WebSocket route definitions
  ws.js                       # WebSocket handler (lifecycle events, message routing)
  chat/                       # Chat Orchestrator Layer
    orchestrator.js            # Session mgmt, LLM conversation loop, tool execution
    session.js                 # In-memory session store (per-tab; cleaned up on subscription/client/user down)
    providers/
      provider.js              # Base LLM provider interface
      claude.js                # Claude API (Anthropic SDK, tool_use)
      openai.js                # OpenAI API (function_calling, optional baseURL)
      lmstudio.js              # OpenAI-compatible (LM Studio, Ollama, etc.) with configurable base URL
  mcp/                        # MCP Tool Layer
    registry.js                # Central tool/schema/template registry
    tools/
      recipeTools.js           # 9 tools: recipe/project CRUD
      introspectionTools.js    # 4 tools: types, schema, bands, visualizations
      guiTools.js              # 3 tools: open/reload/close recipe in browser
      templateTools.js         # 2 tools: list/apply templates
      workflowTools.js         # 5 tools: guided step-by-step creation
    schemas/                   # 20 recipe type schema definitions
      _shared/                 # Shared schema fragments (aoi, dates, sources)
    templates/                 # 8 pre-built recipe templates
  sepal/                      # SEPAL API Clients
    recipeClient.js            # Calls sepal-server recipe endpoints (with gzip)
    geeClient.js               # Calls gee module endpoints
```

## Configuration

Environment variables mapped to CLI flags in `start.sh`:

| Env Var | CLI Flag | Description |
|---------|----------|-------------|
| `SEPAL_ENDPOINT` | `--sepal-endpoint` | sepal-server URL (default: `http://sepal`) |
| `GEE_ENDPOINT` | `--gee-endpoint` | GEE module URL (default: `http://gee`) |
| `LLM_PROVIDER` | `--llm-provider` | `claude`, `openai`, or `lmstudio` (default: `claude`) |
| `LLM_API_KEY` | `--llm-api-key` | API key for the LLM provider |
| `LLM_MODEL` | `--llm-model` | Model name override |
| `LLM_BASE_URL` | `--llm-base-url` | Base URL for OpenAI-compatible providers (e.g. `http://localhost:1234/v1`) |

### Connecting to LM Studio

LM Studio exposes an OpenAI-compatible REST API. To use it:

```
LLM_PROVIDER=lmstudio
LLM_BASE_URL=http://host.docker.internal:1234/v1   # from inside Docker
LLM_MODEL=<model-identifier-as-shown-in-lmstudio>
LLM_API_KEY=lm-studio   # any non-empty string
```

The `lmstudio` provider is also usable for Ollama (`/v1`), vLLM, LocalAI, and any other
server that implements the OpenAI chat completions API.

The `openai` provider also accepts `LLM_BASE_URL` if you need to point the official OpenAI
SDK at a custom endpoint (e.g. Azure OpenAI, OpenRouter).

When `LLM_API_KEY` is empty, the server runs in **echo mode** (echoes messages back without LLM processing).

## LLM-facing text style

Any string the LLM reads is for token consumption, not for humans. Write it telegraphically: drop articles where unambiguous, prefer symbols/arrows (`→`, `=`) over prose, use sentence fragments, abbreviate repeated structural words, omit hedges and filler. Existing files set the bar — match their density when editing or adding text. If a string also appears in a UI tooltip or error message, that copy is separate; don't soften the LLM-facing version to read nicely for humans.

LLM-facing text lives in exactly these places — when changing or adding any of them, apply the rule above:

| Location | What's LLM-facing |
|---|---|
| `src/chat/system-prompt.md` | The whole file (template + guidelines) |
| `src/mcp/tools/*.js` | Each tool's `name`, `description`, and every `parameters.properties.*.description` |
| `src/recipes/<recipe>/schema.json` | Every `description`, `title`, and enum-adjacent prose |
| `src/recipes/<recipe>/index.js` | `description`, `useCases`, `terms`, `chooseWhen`, `dontChooseWhen`, `outputs`, and each `workflowSteps[].description` |
| `src/recipes/<recipe>/rules.js` | Each rule's `description` (the LLM reads this via `recipe_schema`) |
| `src/recipes/shared/*.schema.json` | Shared-fragment descriptions (bundled into every recipe that refs them) |

Anything outside this list is not LLM-facing — code comments, log messages, internal errors, and `name` labels shown in the UI follow normal style.

When reviewing a PR that touches any of the above, push back on prose-y additions even when they read well — every extra clause costs tokens at every turn.

## Non-Obvious Conventions

- **CommonJS**: Uses `require()` / `module.exports`, matching all other Node.js modules in SEPAL.
- **Echo fallback**: If no LLM API key is configured, the orchestrator echoes messages back. Useful for testing the websocket pipeline without LLM costs.
- **Gzip compression**: `recipeClient.js` gzip-compresses recipe contents before POSTing to sepal-server, matching the protocol used by the GUI.
- **`sepal-user` header**: API clients construct a minimal `{username}` JSON header for module-to-module HTTP calls on the Docker network.
- **Session keying**: Chat sessions are keyed by `clientId:subscriptionId` (one per browser tab subscription).
- **Rate limiting**: Per-session sliding window (default 20 messages/minute).
- **Tool call loop**: The orchestrator runs up to 10 LLM→tool→LLM rounds before forcing a text response.
- **Dynamic imports**: LLM SDKs (`@anthropic-ai/sdk`, `openai`) are lazy-loaded via `import()` to avoid startup cost when not configured.
