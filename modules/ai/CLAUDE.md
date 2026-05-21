# CLAUDE.md — modules/ai

AI chat server for SEPAL recipe interaction.

## Practices

[PRACTICES.md](./PRACTICES.md) — architecture, TDD, test layout, injection, code-quality rules. **Read it before changing `src/chat/`.** Deferred cases are tracked in [PUNCH_LIST.md](./PUNCH_LIST.md).

## Commands

```bash
docker exec sepal-dev sepal npm-test ai [pattern] --runInBand   # Jest, focused by pattern
# direct, when already in modules/ai with deps installed:
npm test
npm run coverage -- --runInBand
npm run testWatch
```

The `ai` compose-run container has module-local Jest. Prefer the `sepal npm-test` form so tests run in the module's container context.

## Architecture

**Active path is a rewrite, not a refactor of the old orchestrator.** Entry `src/main.js` → `src/app.js`, wiring `src/chat/conversation/`, `src/chat/tools/`, `src/chat/specialists/`. The pre-rewrite implementation under `archive/pre-rewrite-chat/` is reference only — not imported, not active prompt/tool surface.

`createApp()` (`src/app.js`) is the composition root: event bus, tracer, LLM adapter, GUI request bridge, orchestrator tool registry, Redis chat storage, per-user `UserChats`, websocket handler, HTTP server. Conversation metadata + history persist in Redis; dynamic title generation runs after a successful assistant turn.

### WebSocket protocol
Gateway subscription-based routing. Browser subscribes to module `ai`; messages flow as `{module, subscriptionId, data}`.
- **Lifecycle**: `subscriptionUp/Down` attach/detach a subscription.
- **Conversation list**: `create-conversation`, `list-conversations`, `select-conversation`, `delete-conversation`, `delete-all-conversations`.
- **Chat**: `{type:'message', conversationId, text}` → LLM → `{type:'chat-response', conversationId, text, complete}` broadcast to the user's tabs.
- **Cancellation/context**: `abort` cancels an in-flight stream. GUI context is cached per subscription in `guiContexts` and injected as ephemeral turn context on the first LLM call of the next turn — never persisted to Redis.
- **Tools**: the LLM may emit tool calls; `ConversationLoop` runs them through the registry and feeds `{ok, data?, error?}` back, capped at `MAX_TOOL_ROUNDS`; `tool-start`/`tool-end` broadcast to tabs.
- **GUI request/response**: a tool sends `{type:'gui-action', requestId, action, params}` to the requesting tab; the GUI replies `{type:'gui-response', requestId, success, data?, error?}`, routed back via `guiRequests` (timeout + per-subscription cancellation apply).

REST: `GET /healthcheck` → `{status:'ok'}`.

## Source structure

```
archive/pre-rewrite-chat/     # old chat/tools/recipes — inactive reference
src/
  main.js                     # entry
  app.js                      # composition root
  config.js                   # CLI arg parsing (port, endpoints, LLM config)
  server.js                   # HTTP + WS server adapter
  eventBus.js                 # RxJS Subject port for observability
  tracer.js                   # span lifecycle (per-turn, per-tool, per-LLM call)
  logListener.js              # log4js adapter for the event bus
  chat/
    orchestratorToolRegistry.js   # composes the orchestrator's tool surface
    turnContext.js                # runtime GUI context → LLM context message
    guiRequests.js                # server→browser request/response bridge
    toolCallGuard.js              # per-turn anti-loop guard
    debugText.js                  # truncation helper for debug payloads
    conversation/
      userChat.js                   # pure dispatcher: command type → handler observable
      userChats.js                  # per-username UserChat registry
      messageHandler.js             # 'message' handler: orchestrates one turn end-to-end
      conversations.js              # per-user conversation collection: CRUD + pending lifecycle
      conversation.js               # single conversation: identity + turn queue + abort
      conversationLoop.js           # per-conversation LLM/tool loop
      guiContexts.js                # runtime GUI context cache, keyed by subscription
      titleGenerator.js             # title generation (driven by messageHandler)
      terminalNotices.js            # translatable notice vocabulary (round cap, guard bail)
      cleanTitle.js / fallbackTitle.js   # title cleaning / heuristic fallback
      llmMessages.js                # LLM-visible history projection
      conversationEvents.js         # conversation debug/trace event formatting
      redisChatStorage.js           # port: per-user conversations + per-conversation history
      redisConversationsStore.js / redisHistory.js / redisKeys.js   # Redis adapters + key shapes
      wsHandler.js / wsChannel.js   # inbound WS protocol adapter / outbound channel per subscription
    tools/
      sepalTools.js                 # pure SEPAL product list + specialistInner list
      registry.js                   # tool registry contract (validation, envelopes)
      guiContextTool.js             # get_gui_context
      recipeTools.js                # recipe_list, recipe_load
      recipeProjection.js           # recipe → small inner-LLM-addressable shape
      projectTools.js               # project_list
      mapTools.js                   # map_area_list, layer_list
      prepareUpdateTool.js          # prepare_update — bounded edit work packet
      recipePatchTool.js            # recipe_patch — atomic JSON Patch apply
      guiProductRequest.js          # thin wrapper for tools calling guiRequests
      jsonPointer.js                # RFC 6901 helper
    specialists/
      runSpecialist.js              # inner-loop runtime for one consultation
      specialistConsultationTools.js # consult_* dispatcher tools
      recipeSpecialists.js          # describe_recipe / update_recipe, routed via runtime
      specialistScope.js            # per-specialist allowed-tool scoping
      assembleSpecialistPrompt.js   # base prompt + per-purpose recipe facts
      specialistEvents.js           # specialist diagnostic bus events
    llm/
      index.js                      # createLlm() — provider selector
      events.js / usage.js          # shared bus event publisher / provider-neutral usage
      providers/openaiChatCompletions.js, lmStudioNativeChat.js
    llmText/                        # LLM-facing prompt assets + loader (prompts.js)
      main.md, title.md, emptyAfterToolHint.md
      specialists/                  # one .md per specialist, mirrors src/chat/specialists/
```

## Configuration

Env vars → CLI flags (in `start.sh`): `SEPAL_ENDPOINT`/`--sepal-endpoint`, `GEE_ENDPOINT`/`--gee-endpoint`, `LLM_PROVIDER`/`--llm-provider` (`claude`|`openai`|`lmstudio`), `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` (OpenAI-compatible base, e.g. `http://localhost:1234/v1`), `REDIS_HOST`, `CONVERSATION_TTL_DAYS`, `RATE_LIMIT`, `SESSION_TTL_MINUTES`.

The active rewrite wires `HTTP_PORT`, `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL`, `REDIS_HOST`, `CONVERSATION_TTL_DAYS`, `SESSION_TTL_MINUTES`. `RATE_LIMIT`/`SESSION_TTL_MINUTES` and legacy SEPAL/GEE flags are parsed (compose supplies them) but not yet wired.

The system prompt is project source, not config: `userChats.js` loads `llmText/main.md` via `mainSystemPrompt()` at startup and aborts boot if missing/empty. No override path; tests needing a different prompt build `createConversation` directly with their own `initialMessages`.

**LM Studio** exposes an OpenAI-compatible REST API:
```
LLM_PROVIDER=lmstudio
LLM_BASE_URL=http://host.docker.internal:1234/v1   # from inside Docker
LLM_MODEL=<model id as shown in LM Studio>
LLM_API_KEY=lm-studio                              # any non-empty string
```
The active chat adapter is OpenAI-compatible. `LLM_PROVIDER=lmstudio` also enables a native `/api/v1/chat` path for requests that explicitly disable reasoning (currently title generation only).

## LLM-facing text style

Any string the LLM reads is for token consumption, not humans: telegraphic — drop articles where unambiguous, prefer `→`/`=` over prose, sentence fragments, abbreviate repeated structural words, no hedges/filler. Match the density of existing files. UI-tooltip/error copy is separate — don't soften the LLM-facing version to read nicely.

Active LLM-facing text lives **only** here — apply the rule when touching any:

| Location | What |
|---|---|
| `llmText/*.md` + `llmText/specialists/*.md` | role prompts (`main.md`, `title.md`), empty-after-tool hint, specialist prompts. Loaded via `prompts.js`. New specialist → add a `.md` mirroring `src/chat/specialists/`. |
| `turnContext.js` | runtime turn-context wrapper text |
| `conversation/titleGenerator.js` | title user/wrapper message shape + `/no_think` suffix (role prompt itself is `llmText/title.md`) |
| tool `name`/`description`/`parameters` | sent as tool schemas — product tools in `src/chat/tools/`, specialist tools in `src/chat/specialists/` |

Everything else (code comments, log messages, internal errors, UI `name` labels) is not LLM-facing — normal style. Reviewing a PR touching the above: push back on prose-y additions even when they read well — every clause costs tokens every turn.

## Conventions

- **CommonJS** — `require`/`module.exports`, like all SEPAL Node modules.
- **User-facing errors stay generic** — chat replies the user sees are generic ("an error occurred, please try again"); upstream/provider detail (status, message, stack) goes to the server log via the event bus, never the reply. Raw provider errors are operator-facing and unactionable for users. Applies to the chat error funnel.
- **Subscription keying** — WS subscriptions keyed `clientId:subscriptionId` (one per browser tab).
- **User chat ownership** — `userChats.js` keeps one in-memory `UserChat` per username; tabs for a user share live state. Redis persists metadata/history so list/select/send recover after restart. Runtime GUI context is cached per subscription.
- **Turn serialization** — `ConversationLoop` mutates a shared messages array with no internal serialization. `Conversation` wraps it with a per-conversation turn queue, so concurrent `sendUserMessage$` calls chain and can't interleave. Title generation runs off the queue tail via `MessageHandler`. Drive a turn `UserChat → MessageHandler → Conversation → loop`; never call `ConversationLoop` directly.
- **Tool registry** — `orchestratorToolRegistry.js` composes the orchestrator surface: product tools (`get_gui_context`, `recipe_list`, `project_list`, map inspection), specialist-backed recipe ops (`describe_recipe`, `update_recipe`, future `create_recipe`), and `consult_*` tools. Raw recipe load/patch (`recipe_load`, `prepare_update`, `recipe_patch`) stay specialist-private (inner registry only). Diagnostic/smoke tools stay off the product surface. The registry contract (`tools/registry.js`) owns the structured error envelope (`UNKNOWN_TOOL`, `INVALID_TOOL_ARGS` via ajv, `TOOL_FAILED`); provider wire-format conversion lives in adapters, not the domain.
- **LLM provider boundary** — `conversationLoop.js`/`titleGenerator.js` depend only on the provider-neutral `respondTo$` port from `llm/index.js` (`createLlm`), which builds and routes to per-provider adapters under `llm/providers/`. Provider wire-format names stay confined to the adapters.
- **Direct-answer tools** — a descriptor with `directAnswer: true` opts out of the orchestrator's post-tool restate round: its `{ok:true, data:{answer}}` streams to the user verbatim. Used by specialist-backed tools (`describe_recipe`, `update_recipe`, `consult_*`). Descriptor-only — exposed via `flag(name,'directAnswer')`, NOT in `schemas()` (would leak to the wire format).
- **Specialists** — a specialist is a tool (`consult_<name>` or a recipe-op tool) whose `invoke$` runs an inner LLM loop (`runSpecialist.js`) with its own system prompt + filtered tool set. Two-layer composition: the inner `createToolRegistry` holds product tools only (no specialist recursion); the outer registry adds the specialist tools on top. Prompts live in `llmText/specialists/<name>.md`, loaded via `specialistPrompt(name)`, validated at construction. Specialist results return as ordinary tool-result envelopes the orchestrator integrates.
