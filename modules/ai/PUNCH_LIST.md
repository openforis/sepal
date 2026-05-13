# Punch list — modules/ai

Known cases deferred to future iterations. Don't lose them.

## Concurrency

- **Concurrent `sendUserMessage$` calls** — `Conversation` has no internal serialization; two simultaneous calls would race on the messages array. Current assumption: caller serializes (UI prevents the double-send). Server-side defense (busy flag with explicit error) deferred until a test forces it.

## Tool handling

- **Multi-tool-call test coverage** — production accumulates multiple `{toolCall}` events into an array via the LLM stream's reduce; no test pins it yet.
- **Empty toolCalls array** — `{toolCalls: []}` in a reply takes the text-reply path. Reasonable, untested.
- **Tools port is stubbed** — `app.js` injects a `noTools()` placeholder that throws on `invoke$`. A real MCP tool layer slots in here when re-introduced.
- **GUI tool-response wire is not reintroduced** — old `gui-response` support lives only in `archive/pre-rewrite-chat/`. Bring it back with the tool layer.

## LLM response shapes

- **Mixed text + tool calls in one response** — `handleToolCalls$` records the assistant text alongside `toolCalls`, but the text is not separately emitted to the user channel during a tool step. Possibly intentional; verify.

## Cancellation

- **Abort wire path is in place.** `UserChat` tracks the in-flight `Subscription` per conversation and `unsubscribe()`s it on abort, then broadcasts a `chat-response` with `complete: true` to unlock all the user's tabs. PUNCH_LIST follow-up: a distinguishing flag (`aborted: true`?) so the GUI can show "cancelled" vs natural completion. Today they look identical.

## Observability

- **wsRouter silently ignores unknown messages** — publishes `{type: 'wsIn', kind: 'unknown'}` at `warn`. Could be elaborated with the data shape, but only once we hit an unknown-message debugging session.
- **More spans** — currently `server.start`, `conversation.send`, `llm.respondTo` have spans. `tool.invoke` is the natural next one once tools come back.
- **Late-bound span completion attrs** — `tracer.span$(name, attrs, work$)` fixes attrs at construction. For `llm.respondTo` we want to include `chunks` + `text` + `usage` (tokens) in the `completed` event, but those are only known once the stream finishes. Today we emit those as a separate `llm.response` bus event. Cleaner: extend tracer to accept a context (`(name, attrs, ctx => work$)`), with `ctx.addAttrs({...})` callable during the run; the completed event merges them in.
- **Token / cache / thinking tracking** — once the OpenAI streams expose `usage` (LM Studio gives partial info; needs `stream_options: {include_usage: true}` and a model that respects it), emit a domain `{usage}` event from the LLM adapter, accumulate per-Conversation, surface in `conversation.send` completed attrs. Same emission path will carry `{thinkingDelta}` for models that stream reasoning separately.

## GUI wire protocol deferred cases

Supported now:
- `subscriptionUp` / `subscriptionDown`
- `create-conversation` → `conversation-created` (originator) + `conversation-claimed` (other tabs of same user)
- `select-conversation` → `conversation-loaded` (requesting tab only)
- `list-conversations` → `conversations`
- `delete-conversation` → `conversation-deleted` (broadcast to all tabs of same user)
- `delete-all-conversations` → `conversation-deleted` for each conversation (broadcast to all tabs of same user)
- `message` with `conversationId` → `chat-response` (broadcast to all tabs of same user)
- `user-message` → GUI appends user input in other tabs that are viewing the same conversation
- `abort` → in-flight subscription cancellation + final `chat-response complete`
- `context` → recognised and logged at debug, but ignored until system-prompt templating returns

Still deferred:

- `gui-response` (for tool-driven GUI actions like open/reload/close recipe)

Adding a wire message type is now mechanical: `wsRouter` route + `UserChat` method + (if outbound) `wsChannel` method.

## Persistence

Redis-backed adapters are wired into `app.js` now:
- **History** (per-conversation messages) — `src/chat/io/redisHistory.js`
- **ConversationsStore** (per-user conversation list) — `src/chat/io/redisConversationsStore.js`

The in-memory adapters live under `test/chat/io/` for unit tests only.

Restart behaviour:
- `list-conversations` reads Redis metadata directly.
- `select-conversation` and `message` lazily rebuild a `Conversation` from Redis history when the in-memory `UserChat` map does not have it yet.
- In-flight streams still do not survive restart; clients should see the connection reset and unlock through reconnect/list/select flows.

## Conversation metadata

`ConversationsStore` stores `{id, title, createdAt, updatedAt}` records now, but title is still always `''`. Next useful step: deterministic baseline title from the first user message, then optional LLM refinement later.

## Conversation snapshot includes the system message

`Conversation.messagesSnapshot()` returns the in-memory array including the leading `{role: 'system'}` entry when a `systemPrompt` is set. The GUI then receives the system message inside `conversation-loaded`. Either filter `role: 'system'` in the GUI, or in `messagesSnapshot()` before serialising. Decide once the GUI re-renders historical conversations.

## Single ai-module instance assumption

Cross-tab sync currently goes through in-memory `UserChat` state. If we deploy multiple ai-module instances behind a load balancer, two tabs of the same user could hit different instances and lose sync. Redis pub/sub (or similar) becomes load-bearing at that point — adds a `broadcast` collaborator that publishes/subscribes to cross-instance events.

---

Larger spec migration items (round classification, failure bail, cap-reached, 429 retry, stall nudge) are tracked in [the design spec §8](../../docs/superpowers/specs/2026-05-12-ai-module-goose-refactor-design.md), not duplicated here.
