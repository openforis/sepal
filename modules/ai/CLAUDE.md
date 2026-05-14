# CLAUDE.md - modules/ai

AI chat server for SEPAL recipe interaction.

## Practices

See [PRACTICES.md](./PRACTICES.md) for architecture, TDD, test layout, injection, and code-quality rules used in this module. Read it before changing code under `src/chat/`.

Deferred items (cases consciously skipped for now) are tracked in [PUNCH_LIST.md](./PUNCH_LIST.md).

## Commands

```bash
sepal npm-test ai --runInBand            # Normal test path from sepal-dev
sepal npm-test ai <pattern> --runInBand  # Focused Jest test from sepal-dev
npm test                                 # Direct Jest, when already in modules/ai with deps installed
npm run coverage -- --runInBand          # Direct coverage, when already in modules/ai
npm run testWatch                        # Jest watch mode
```

The `ai` compose-run container has module-local Jest installed. Use the `sepal npm-test`
form for Codex/session work so tests run in the same container context as the module.

## Key Architecture

### Rewrite Status

The active AI chat path is a rewrite, not a refactor of the old orchestrator. The active
entry is `src/main.js` → `src/app.js`, which wires `src/chat/io/` and
`src/chat/sendMessage/`.

The pre-rewrite chat/tool/recipe implementation is archived under
`archive/pre-rewrite-chat/` for temporary reference. It is not imported by the active
module.

### Active Design

**Chat Rewrite Layer** (`src/chat/`) — Active websocket, conversation, history, and
LLM-stream handling for the GUI chat. Conversation metadata and message history are
persisted in Redis; dynamic title generation runs after successful assistant turns.

**Archived Tool/Recipe Layer** (`archive/pre-rewrite-chat/src/mcp/`,
`archive/pre-rewrite-chat/src/recipes/`, `archive/pre-rewrite-chat/src/sepal/`) —
old MCP tools, recipe schemas, and SEPAL/GEE clients. Kept only as reference until
the rewrite reintroduces those capabilities deliberately.

### Entry Point
`src/main.js` — starts `createApp()` from `src/app.js`, wiring the HTTP server, event bus, tracer, websocket handler, in-memory conversation stores, and LLM adapter.

### WebSocket Protocol
Uses the gateway's subscription-based websocket routing. The browser subscribes to `ai` module, and messages flow as `{module, subscriptionId, data}`.

- **Lifecycle events**: `subscriptionUp/Down` attach/detach a tab subscription
- **Conversation list**: `create-conversation`, `list-conversations`,
  `select-conversation`, `delete-conversation`, `delete-all-conversations`
- **Chat messages**: `{type: 'message', conversationId, text}` from client → LLM
  processing → `{type: 'chat-response', conversationId, text, complete}` broadcast
  back to the user's tabs
- **Cancellation/context**: `abort` cancels an in-flight stream; `context` is
  stored per tab/subscription in `UserChat` and injected as ephemeral turn
  context on the first LLM call of the next user turn (never persisted to Redis)
- **Tools**: the LLM may emit tool calls; `Conversation` invokes them through a
  tool registry and feeds structured `{ok, data?, error?}` results back, capped
  at `MAX_TOOL_ROUNDS`. `tool-start` / `tool-end` broadcast to the user's tabs
- **GUI request/response**: a tool can send `{type: 'gui-action', requestId,
  action, params}` to the requesting tab; the GUI replies `{type:
  'gui-response', requestId, success, data?, error?}`, routed back through
  `guiRequests` to resolve the pending request (timeout + per-subscription
  cancellation apply)

### REST API
- `GET /healthcheck` — Returns `{status: 'ok'}`

## Source Structure

```
archive/
  pre-rewrite-chat/           # Old chat/tools/recipes implementation, inactive
    SCHEMA_AUTHORING.md       # Old recipe-schema authoring guide
    src/chat/                 # Old orchestrator/session implementation
    src/mcp/                  # Old MCP tool layer
    src/recipes/              # Old recipe schema layer
    src/sepal/                # Old SEPAL/GEE HTTP clients
src/
  main.js                     # Entry point
  app.js                      # Active rewrite composition
  config.js                   # CLI argument parsing (port, endpoints, LLM config)
  chat/                       # Chat Rewrite Layer
    io/                        # Active adapters: websocket, Redis stores, GUI request bridge
    llm/                       # LLM provider boundary: provider-neutral selector + per-provider adapters
    sendMessage/               # Active conversation/user-chat/title-generation/tool-registry slice
    system-prompt.md           # Active system prompt
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
| `REDIS_HOST` | `--redis-host` | Redis host for conversation metadata/history persistence |
| `CONVERSATION_TTL_DAYS` | `--conversation-ttl-days` | Redis TTL for persisted conversation metadata/history |
| `RATE_LIMIT` | `--rate-limit` | Parsed for future server-side rate limiting |
| `SESSION_TTL_MINUTES` | `--session-ttl-minutes` | Parsed for future session expiry work |
| `SYSTEM_PROMPT` | `--system-prompt` | System prompt prepended to every conversation |
| `ENABLE_AI_TRANSPORT_SMOKE_TOOLS` | `--enable-ai-transport-smoke-tools` | Register transport smoke-test tools (`echo`); dev/test only, default `false` |

The active rewrite currently uses `HTTP_PORT`, `LLM_PROVIDER`, `LLM_API_KEY`,
`LLM_MODEL`, `LLM_BASE_URL`, `REDIS_HOST`, `CONVERSATION_TTL_DAYS`,
`SYSTEM_PROMPT`, and `ENABLE_AI_TRANSPORT_SMOKE_TOOLS`.
Some legacy/future flags are still parsed by `src/config.js` because compose
supplies them, but the active app does not yet wire SEPAL/GEE clients,
server-side rate limiting, or session expiry.

### Connecting to LM Studio

LM Studio exposes an OpenAI-compatible REST API. To use it:

```
LLM_PROVIDER=lmstudio
LLM_BASE_URL=http://host.docker.internal:1234/v1   # from inside Docker
LLM_MODEL=<model-identifier-as-shown-in-lmstudio>
LLM_API_KEY=lm-studio   # any non-empty string
```

The active chat adapter is OpenAI-compatible. `LLM_PROVIDER=lmstudio` also
enables a native LM Studio `/api/v1/chat` path for requests that explicitly
disable reasoning, currently used by dynamic title generation.

## LLM-facing text style

Any string the LLM reads is for token consumption, not for humans. Write it telegraphically: drop articles where unambiguous, prefer symbols/arrows (`→`, `=`) over prose, use sentence fragments, abbreviate repeated structural words, omit hedges and filler. Existing files set the bar — match their density when editing or adding text. If a string also appears in a UI tooltip or error message, that copy is separate; don't soften the LLM-facing version to read nicely for humans.

Active LLM-facing text lives in exactly these places — when changing or adding any
of them, apply the rule above:

| Location | What's LLM-facing |
|---|---|
| `src/chat/system-prompt.md` | The whole file (static system prompt) |
| `src/chat/sendMessage/turnContext.js` | Runtime turn-context message wrapper text |
| `src/chat/sendMessage/titleGenerator.js` | Title-generation prompt messages |
| Tool `name` / `description` / `parameters` | Sent to the LLM as tool schemas — the read-only product tools in `src/chat/sendMessage/productTools.js` and the dev/test smoke tools in `src/app.js` |

Old tool and recipe-schema LLM text lives under `archive/pre-rewrite-chat/` now.
Treat it as reference, not active prompt/tool surface.

Anything outside this list is not LLM-facing — code comments, log messages, internal errors, and `name` labels shown in the UI follow normal style.

When reviewing a PR that touches any of the above, push back on prose-y additions even when they read well — every extra clause costs tokens at every turn.

## Non-Obvious Conventions

- **CommonJS**: Uses `require()` / `module.exports`, matching all other Node.js modules in SEPAL.
- **Subscription keying**: Websocket subscriptions are keyed by
  `clientId:subscriptionId` (one per browser tab subscription).
- **User chat ownership**: `app.js` keeps one in-memory `UserChat` per username.
  Tabs for the same user share live conversation state; Redis stores conversation
  metadata/history so list/select/send can recover after restart. Active selection
  remains per tab in the GUI.
- **Turn serialization**: `Conversation` mutates a shared messages array and has
  no internal serialization. `UserChat` serializes turns per conversation — each
  turn's stream chains onto the previous turn's stream completion, so concurrent
  `sendUserMessage$` calls can't interleave. Title generation runs after the
  stream but off the queue tail. New callers must drive `Conversation` through
  `UserChat`, not invoke it directly.
- **Tool registry**: `app.js` wires `createToolRegistry`. The production tool
  surface holds the read-only product tools (`get_context`, `recipe_list`,
  `project_list`, `recipe_load`) from `src/chat/sendMessage/productTools.js`;
  transport
  smoke-test tools (`echo`) register only
  when `ENABLE_AI_TRANSPORT_SMOKE_TOOLS=true`, and are never visible to the
  production model. `ask_gui_echo` stays unregistered until a matching GUI
  `echo` action exists. The registry owns the structured tool-error envelope
  (`UNKNOWN_TOOL`, `INVALID_TOOL_ARGS` via ajv, `TOOL_FAILED`); provider
  wire-format conversion lives in the adapters, not the domain.
- **LLM provider boundary**: `conversation.js` / `titleGenerator.js` depend only
  on the provider-neutral `respondTo$` port from `src/chat/llm/index.js`
  (`createLlm`). It builds the per-provider adapters under
  `src/chat/llm/providers/` (`openaiChatCompletions.js`, `lmStudioNativeChat.js`)
  and routes to them; provider wire-format names stay confined to the adapters.
