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
entry is `src/main.js` → `src/app.js`, which wires `src/chat/conversation/`,
`src/chat/tools/`, and `src/chat/specialists/`.

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
`src/main.js` — starts `createApp()` from `src/app.js`, which wires the
event bus, tracer, LLM adapter, GUI request bridge, orchestrator tool
registry, Redis-backed chat storage, per-user `UserChats` registry,
websocket handler, and HTTP server.

### WebSocket Protocol
Uses the gateway's subscription-based websocket routing. The browser subscribes to `ai` module, and messages flow as `{module, subscriptionId, data}`.

- **Lifecycle events**: `subscriptionUp/Down` attach/detach a browser subscription
- **Conversation list**: `create-conversation`, `list-conversations`,
  `select-conversation`, `delete-conversation`, `delete-all-conversations`
- **Chat messages**: `{type: 'message', conversationId, text}` from client → LLM
  processing → `{type: 'chat-response', conversationId, text, complete}` broadcast
  back to the user's tabs
- **Cancellation/context**: `abort` cancels an in-flight stream; GUI context is
  cached per browser subscription in `guiContexts` and injected as ephemeral
  turn context on the first LLM call of the next user turn (never persisted to
  Redis)
- **Tools**: the LLM may emit tool calls; `ConversationLoop` invokes them through
  a tool registry and feeds structured `{ok, data?, error?}` results back, capped
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
  app.js                      # Composition root: wires every chat collaborator
  config.js                   # CLI argument parsing (port, endpoints, LLM config)
  server.js                   # HTTP + WS server adapter
  eventBus.js                 # RxJS Subject port for observability
  tracer.js                   # Span lifecycle (per-turn, per-tool, per-LLM call)
  logListener.js              # log4js adapter for the event bus
  chat/                       # Chat slice
    orchestratorToolRegistry.js   # Composes the orchestrator's tool surface
    turnContext.js                # Runtime GUI context → LLM context message
    guiRequests.js                # Server→browser request/response bridge
    toolCallGuard.js              # Per-turn anti-loop guard for tool calls
    debugText.js                  # Truncation helper for debug-log payloads
    conversation/              # Per-conversation slice + Redis persistence + WS adapters
      userChat.js                   # Pure dispatcher: wire command type → handler observable
      userChats.js                  # Per-username UserChat registry
      messageHandler.js             # Handler for the 'message' command: orchestrates one turn end-to-end
      conversations.js              # Per-user conversation collection: CRUD + pending lifecycle
      conversation.js               # Single conversation entity: identity + turn queue + abort
      conversationLoop.js           # Per-conversation LLM/tool loop (called by conversation)
      guiContexts.js                # Runtime GUI context cache keyed by subscription
      titleGenerator.js             # Title-generation orchestration (called by messageHandler)
      terminalNotices.js            # Translatable notice vocabulary (round cap, guard bail)
      cleanTitle.js                 # LLM-title cleaning helpers
      fallbackTitle.js              # Heuristic-title fallback helpers
      llmMessages.js                # LLM-visible history projection
      conversationEvents.js         # Conversation debug/trace event formatting
      redisChatStorage.js           # Port: per-user conversations + per-conversation history
      redisConversationsStore.js    # Redis adapter for conversation metadata
      redisHistory.js               # Redis adapter for one conversation's history
      redisKeys.js                  # Redis key shape helpers
      wsHandler.js                  # Inbound WS protocol adapter
      wsChannel.js                  # Outbound WS channel per subscription
    tools/                     # Individual tool families + registry + GUI bridge wrapper
      sepalTools.js                 # Pure SEPAL product list + specialistInner list
      registry.js                   # Tool registry contract (validation, envelopes)
      guiContextTool.js             # get_gui_context
      recipeTools.js                # recipe_list, recipe_load
      recipeProjection.js           # Recipe → small inner-LLM-addressable shape
      projectTools.js               # project_list
      mapTools.js                   # map_area_list, layer_list
      guiProductRequest.js          # Thin wrapper for tools calling guiRequests
      jsonPointer.js                # RFC 6901 helper (used by recipeProjection)
    specialists/               # Specialist runtime + dispatchers + recipe ops
      runSpecialist.js              # Inner-loop runtime for one consultation
      specialistConsultationTools.js # consult_* dispatcher tools (orchestrator-facing)
      recipeSpecialists.js          # Recipe-op tools (describe_recipe) routed via runtime
      specialistScope.js            # Per-specialist allowed-tool scoping
    llm/                       # LLM provider boundary
      index.js                      # createLlm() — provider selector
      events.js                     # Provider-shared bus event publisher
      providers/openaiChatCompletions.js
      providers/lmStudioNativeChat.js
    llmText/                   # LLM-facing prompt assets + loader
      prompts.js                # Loader; fails fast on empty/missing
      main.md                   # Main Sepalito system prompt
      title.md                  # Title-generator system prompt
      emptyAfterToolHint.md     # Hint injected on the empty-after-tool retry
      specialists/              # One markdown file per specialist (mirrors src/chat/specialists/)
        map.md                   # Read-only map specialist system prompt
        recipe.md                # Recipe specialist system prompt
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

The system prompt is project source, not configuration:
`src/chat/conversation/userChats.js` loads `src/chat/llmText/main.md` via
`mainSystemPrompt()` at startup and aborts boot if the asset is missing or
empty. There is no override path; tests that need a different prompt
construct `createConversation` directly with their own `initialMessages`.

The active rewrite currently uses `HTTP_PORT`, `LLM_PROVIDER`, `LLM_API_KEY`,
`LLM_MODEL`, `LLM_BASE_URL`, `REDIS_HOST`, `CONVERSATION_TTL_DAYS`, and
`SESSION_TTL_MINUTES`.
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
| `src/chat/llmText/*.md` + `src/chat/llmText/specialists/*.md` | Top-level role prompts (`main.md`, `title.md`), the empty-after-tool retry hint (`emptyAfterToolHint.md`), and specialist prompts (`specialists/map.md`, etc.). Loaded via `src/chat/llmText/prompts.js` — `mainSystemPrompt()`, `titleSystemPrompt()`, `emptyAfterToolHint()`, `specialistPrompt(name)`. New specialists add a `.md` under `specialists/` here matching the code at `src/chat/specialists/`. |
| `src/chat/turnContext.js` | Runtime turn-context message wrapper text |
| `src/chat/conversation/titleGenerator.js` | Title-generator user/wrapper message (the `User asked: ... Assistant replied: ...` shape and the `/no_think` suffix); the title role prompt itself lives in `llmText/title.md`. |
| Tool `name` / `description` / `parameters` | Sent to the LLM as tool schemas — SEPAL product tools in `src/chat/tools/` and specialist consultation tools in `src/chat/specialists/` |

Old tool and recipe-schema LLM text lives under `archive/pre-rewrite-chat/` now.
Treat it as reference, not active prompt/tool surface.

Anything outside this list is not LLM-facing — code comments, log messages, internal errors, and `name` labels shown in the UI follow normal style.

When reviewing a PR that touches any of the above, push back on prose-y additions even when they read well — every extra clause costs tokens at every turn.

## Non-Obvious Conventions

- **CommonJS**: Uses `require()` / `module.exports`, matching all other Node.js modules in SEPAL.
- **Subscription keying**: Websocket subscriptions are keyed by
  `clientId:subscriptionId` (one per browser tab subscription).
- **User chat ownership**: `src/chat/conversation/userChats.js` keeps one
  in-memory `UserChat` per username. Tabs for the same user share live
  conversation state; Redis stores conversation metadata/history so
  list/select/send can recover after restart. Runtime GUI context is cached
  per websocket subscription.
- **Turn serialization**: `ConversationLoop` mutates a shared messages array
  and has no internal serialization. The `Conversation` entity wraps the loop
  with the per-conversation turn queue, so concurrent `sendUserMessage$` calls
  chain onto the previous turn's completion and can't interleave. Title
  generation runs off the queue tail, driven by `MessageHandler`. New callers
  drive a turn through `UserChat` → `MessageHandler` → `Conversation` → loop —
  never invoke `ConversationLoop` directly.
- **Tool registry**: `src/chat/orchestratorToolRegistry.js` composes the
  orchestrator's tool surface — SEPAL product tools (`get_gui_context`,
  `recipe_list`, `project_list`, map inspection tools), specialist-backed
  recipe operation tools (`describe_recipe`, and future
  `update_recipe`/`create_recipe`), and specialist consultation tools
  (`consult_*`). Raw recipe load/patch tools stay specialist-private (only
  in the inner registry that specialists see, not on the orchestrator
  surface). Diagnostic/smoke tools stay out of the runtime product surface.
  The registry contract itself lives in `src/chat/tools/registry.js` and
  owns the structured tool-error envelope (`UNKNOWN_TOOL`,
  `INVALID_TOOL_ARGS` via ajv, `TOOL_FAILED`); provider wire-format
  conversion lives in the adapters, not the domain.
- **LLM provider boundary**: `conversationLoop.js` / `titleGenerator.js` depend
  only on the provider-neutral `respondTo$` port from `src/chat/llm/index.js`
  (`createLlm`). It builds the per-provider adapters under
  `src/chat/llm/providers/` (`openaiChatCompletions.js`, `lmStudioNativeChat.js`)
  and routes to them; provider wire-format names stay confined to the adapters.
- **Direct-answer tools**: a tool descriptor with `directAnswer: true` opts the tool out of the orchestrator's post-tool restate round — its `{ok: true, data: {answer}}` envelope streams to the user verbatim. Used for specialist-backed tools (`describe_recipe`, `update_recipe`, `consult_*`) whose output is already user-facing prose. The flag is descriptor-only; the tool registry exposes it via `flag(name, 'directAnswer')` and does NOT include it in `schemas()` (would leak to the LLM wire format).
- **Specialists**: a specialist is exposed to the main model as a normal tool
  (`consult_<name>`) whose `invoke$` runs an inner LLM loop under
  `src/chat/specialists/runSpecialist.js` with its own system prompt + a
  filtered tool set. Two-layer composition in
  `src/chat/orchestratorToolRegistry.js`: the inner `createToolRegistry`
  holds product tools only (so specialists can't recurse into other
  specialists), and the outer registry adds the specialist consultation
  tools on top of it. Specialist prompts live in
  `src/chat/llmText/specialists/<name>.md` and are loaded via
  `specialistPrompt(name)`, validated at construction. Current specialist:
  `consult_map` (read-only, allowed: `get_gui_context`, `map_area_list`,
  `layer_list`). Specialist results return as ordinary tool-result
  envelopes; the main model integrates them into its final reply.
