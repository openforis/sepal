# Development practices

Rules for code. LLM-consumed; written for density.

## Approach

GOOSE (Freeman & Pryce) + ports-and-adapters + vertical slicing.

- **GOOSE**: tests first. Design emerges in refactor. Test pain = design feedback — listen.
- **Ports & adapters**: domain holds behaviour. External systems (HTTP, WS, SDKs, DBs, message brokers, browsers) behind thin adapters. Domain tested with doubles.
- **Vertical slicing**: layout by feature, not by layer. Slices don't import slices.

## Ports & adapters

Domain speaks domain terms. Knows nothing of HTTP, WS, SDKs, DB drivers.

Adapter = wraps **one** external dep + translates between its shape and a domain shape. I/O only. No decisions, no logic.

```
inbound                DOMAIN                outbound
protocol / SDK    →   domain object    →    SDK / driver / DB / queue / cache
```

Adapter ≈ 10–50 lines. Growing adapter = domain logic leaked in → pull back.

Adapters belong to the vertical slice that owns the use case. Put an adapter next
to the domain code it serves unless it is genuinely shared by multiple slices;
promote shared adapters deliberately, not by default.

## Vertical slicing

Layout reflects features, not layers.

```
src/<area>/
  <featureA>/
  <featureB>/
  ...
  composition.<ext>    wires adapters to feature entries
```

No generic `domain/`, `ports/`, `adapters/`, `utils/`, or catch-all `io/`
layers. A slice's domain = its files. A slice's ports = constructor-injected
collaborator shapes. Edge adapters live with the slice they adapt for.

Slices don't import sibling slices for hidden implementation details. Cross-slice
wiring goes through composition, exported entry points, or an explicitly shared
module with a name that describes the shared domain concept.

## Async style

Async code uses **RxJS Observables**, not Promises / async-await. Functions returning observables are suffixed `$`.

Wins:

- Cancellation cascades — unsubscribe tears down the whole chain.
- Streaming and single-value results are the same shape.
- Composes with the rest of the codebase (HTTP, message queues, tool runners) which is already observable.

Promises only at the boundary of third-party APIs that return them — wrap via `from(...)` inside the adapter. Domain code never sees a Promise.

**Time is I/O.** Use a `Clock` port (`clock.now$`, `clock.delay$(ms)`, etc.). Real clocks in adapters; controlled clocks in tests. No `Date.now()`, no `setTimeout` in the domain.

**Tests stay synchronous when the chain is synchronous.** When the production chain runs to completion in one `.subscribe()` (sync observables — `of(...)`, `defer(() => of(...))`, Subjects with synchronous emission), tests use plain `subscribe` and capture results synchronously. No `async` / `await`.

```js
test('...', () => {
    // sync chain (domain + sync fakes, or sync adapters)
    domainObject.do$(input).subscribe({error: e => { throw e }})
    expect(...).toEqual(...)
})
```

**Adapter tests that wrap async I/O are async** — that's honest, not a smell. Production wraps a Promise → `from(promise)` is inherently async → test awaits via `firstValueFrom`. The async there isn't a leak; it's the adapter's whole job.

```js
test('...', async () => {
    const events = await firstValueFrom(adapter.do$(input).pipe(toArray()))
    expect(events).toEqual(...)
})
```

The rule for **domain** tests still holds: if a domain test seems to need to be async, that's feedback — something async leaked out of an adapter. Push it back.

## Function style

Use `function` declarations for named functions (module-level *and* nested inside a factory). Two reasons:

- **Importance-first ordering composes naturally.** Hoisting lets declarations sit *below* the code that calls them — the public entry / high-level orchestrator goes at the top of the enclosing scope, helpers fan out below in decreasing abstraction.
- **At a glance**, `function foo$()` reads as a function. A `const foo$ = () =>` reads as a value assignment that happens to be a function.

```js
function createX(deps) {
    const state = []

    return {publicMethod}

    function publicMethod(input) { ... }

    function helper$() { ... }
}
```

Methods on a returned object use **method shorthand** — same "looks like a function" win as `function`, in the only form an object-literal supports:

```js
return {
    method$(arg) { ... },
    field
}
```

**Exception**: inlined / anonymous functions — callbacks, predicates, mappers, RxJS operators — use arrows.

```js
source$.pipe(
    map(x => x * 2),
    tap(() => log('side effect')),
    concatMap(value => makeRequest$(value))
)
```

Same in tests — `it('...', () => { ... })`, `beforeEach(() => { ... })`. The callback is inlined into Jest's API; arrow is correct.

## Event bus

A pub/sub for **cross-cutting concerns** — logging, metrics, tracing, audit — kept out of the domain. Domain publishes events; handlers subscribe in composition. Domain stays focused on behaviour; observability bolts on without touching it.

Implementation: an RxJS `Subject` exposed as a port. No library — composes with the codebase, supports cancellation via unsubscribe.

```js
events.publish({type: 'turn.completed', conversationId, correlationId, at, durationMs, ok})

// composition wires subscribers:
events.on$(e => e.type.startsWith('turn.')).subscribe(logTurnEvent)
events.on$(e => e.type === 'tool.completed').subscribe(recordToolMetrics)
```

**Peer-type roles**: Notification to publishers; Dependency to subscribers.

**Bus vs explicit collaborator**:

- **Bus** when the publisher doesn't care that anyone is listening — its correctness doesn't depend on the receiver. Logging, metrics, audit. Also fire-and-forget domain reactions where the trigger is "this just happened" (e.g. title generation after a turn).
- **Explicit Notification** (constructor-injected) when the publisher's behaviour depends on the receiver doing its job — sending to a client channel, persisting state required for the next turn, cancelling a chain.

If a domain object's correctness depends on something happening, pass the collaborator explicitly.

**Start / stop pattern**: emit paired events so subscribers can correlate and measure duration. Real-time log visibility ("starting…" / "completed in 1.2 s") is cheap and useful.

```
{type: 'turn.started',   conversationId, correlationId, at}
{type: 'turn.completed', conversationId, correlationId, at, ok, durationMs, ...summary}
{type: 'turn.failed',    conversationId, correlationId, at, error}
```

Nested actions (turn → llm-call → tool-invocation) get a child `correlationId` referencing the parent, so traces are reconstructable.

**When to introduce code for it**: only when a real subscriber drives it. Don't publish into the void to "lock in the shape" — the shape will be wrong without a real consumer informing it.

## Object design

**Tell, don't ask.** Methods cause behaviour. Avoid getters whose only purpose is letting callers branch — push the branch into the object.

**Object peer types** (GOOSE — decides *how* a collaborator is passed in):

- **Dependencies** — collaborators the object needs to do its job. Constructor.
- **Notifications** — listeners the object tells about what happened. Constructor.
- **Adjustments** — config that tunes behaviour (timeouts, retries, identifiers). Config or method args, not constructor collaborators.

**State lives in the domain object.** It owns its in-memory state (lists, counters, derived values). Durable persistence is a Notification, not a source of truth — the object tells the persister about each change; it doesn't read from the persister on every operation. Don't reach into a collaborator for state the object should hold itself.

**Required deps over null-checked optionals.** When a constructor needs a collaborator, require it. For code paths that don't exercise the collaborator, export one canonical inert instance beside the factory (e.g. `noPendingActions` next to `createPendingActions`) — production and tests both pass a real or inert instance, never `undefined`. Defensive `?.method()` is a smell: real-world missing wiring slips through silently, and call sites bloat. For circular constructor deps, resolve with a lazy closure over the late dep (`{get$: id => later.get$(id)}`), not a forwarder object that null-checks until the late dep arrives — JS closures resolve lexically at call time, untangling the cycle without an intermediate holder.

**Factory-with-collaborators** is the dynamic-language analogue of constructor injection. Use for stateful or coordinating objects. Per-call data → method args.

```js
const createOrder = ({inventory, pricing, audit, id}) => ({
    place$(items) { ... }
})
```

Stateless utilities → all-args functions. No module-level singletons.

## Naming

Every name is a design decision, weighed each time. Use the **ubiquitous language** of the domain — the words a practitioner in that field would use.

When introducing a **new** name, ground it in established domain language. Where to find it depends on the field — APIs and well-established libraries (LLM / AI dev), academic papers and standards bodies (remote sensing, geosciences, scientific computing), industry glossaries, established research terminology. Take the short detour to look it up; the established term beats an invented synonym.

When porting from an existing implementation, **don't inherit names**. Old names encode an old design; they likely mean something other than what we're building now.

Weigh every name against:

- **Domain vocabulary**: what do practitioners call this concept? Use that word.
- **Role**: does the name describe the thing's responsibility? (`repo` implies CRUD reads; `history` doesn't.)
- **Consistency across the codebase**: same operation → same verb, everywhere. If `history.append$` exists, the local helper that wraps "append to in-memory + tell history" is `append$`, not `record$`, `save$`, or `store$`. Local synonyms for the same domain action are a smell.
- **Collisions in scope**: will the same word need to mean something different nearby? (`messages` for both the data list *and* its persistence collaborator → conflict.)
- **Brevity vs explicitness**: short wins when context disambiguates (`history` inside a `Conversation`). Long earns its length only when context doesn't help.

Test: read the call site aloud. Does it sound natural to a domain expert? If a name reads as code-shaped jargon rather than domain-shaped, refactor it.

## Cohesion

Elements of a unit relate to one purpose. Apply at every level — function, file, slice, module.

- **Function**: every statement serves one job. Hard to name = cohesion low → split.
- **File**: every function serves one concept. If the imports tell a different story than the exports, split along that line.
- **Slice**: every file contributes to the slice's feature. A file that could move to another slice without anyone noticing is in the wrong slice.
- **Module**: every slice contributes to the module's purpose.

**Smells → refactor signal**:

- Branches in a function that touch disjoint data.
- File where half the functions never call the other half.
- "Helper" / "utils" file growing into a junk drawer.
- Two things that always change together but live in different files.
- Test setting up state for one feature to exercise another.
- "and" in a name.
- Mixed abstraction levels in one function.

**Moves**: group related, separate unrelated. Watch the imports — if a file imports things only half of it needs, split. Name what's missing; if you can name what a group of statements does, extract it. Don't tolerate a junk drawer.

## TDD

Strict red → green → refactor. **No production code without a failing test.**

1. **Red**: failing test. Run. Verify fails for the expected reason (missing feature, not typo / import).
2. **Green**: minimum code. Hardcoded returns, duplication, ugly conditionals — all fine. Don't design.
3. **Refactor**: longest phase. Tests green throughout. Apply the refactor lens (see Cohesion + the lens at the end) **to production code and test code alike** — each cycle's refactor covers both.
4. Stop. Commit. Next test.

Production code without a red-test ancestor → delete, re-derive.

## Nested loops

- **Outer (acceptance)**: domain-term test against the domain object, externals faked. Red while inner loops cycle. Green when the feature is done.
- **Inner (unit)**: fast, focused on individual pieces. Drives design within the feature.

Acceptance tests are **not** through HTTP / WS / SDK adapters. End-to-end *within the domain*. Real-external smoke tests are separate, sparse, justify each one.

## Design-driving tests first

Pick the next test for the structural decision it forces, not for the case it covers.

When starting or extending a feature, write the test that drives the next architectural move — a new collaborator, a new piece of state, a new abstraction. Defer **degenerate cases** (empty inputs, validation errors, off-by-one) until the shape is stable. Coming back to fill them in is cheap; coming back to redesign around them is not.

Some "degenerate" cases are themselves design-driving — abort, retry, failure bail, rate limit, cap-reached. When their turn comes they get their own iteration with their own architectural pressure, not fill-ins.

Keep a punch list of deferred cases so nothing rots in memory.

## Test scoping

- **Most tests are domain tests**: build the domain object with fake collaborators, call its methods, assert on the fakes.
- **Few tests are adapter tests**: one or two per adapter, narrow translation focus.

The HTTP / WS endpoint is an adapter. **The domain is not tested through it.**

When testing an adapter, fake the *other side* — the part we don't own:

- **Outbound** adapter (wraps an SDK / driver): fake the SDK. Feed domain-shaped input → assert the SDK was called correctly + response translated back to domain shape correctly.
- **Inbound** adapter (wraps a protocol / router): fake the domain object. Feed wire-shaped input → assert the domain method was called with the right domain args.

Don't re-test SDKs.

## Stable seams

Test at the seam closest to the behaviour that resists refactor. File-shaped seams break on reshuffles that preserve behaviour — tax on every change.

Seams in this module, top-down. Pick the lowest that exercises the behaviour:

| Seam | When | What it pins |
|---|---|---|
| WS protocol (`wsHandler`) | End-to-end including protocol concerns | Wire frame in → wire frames out |
| `userChat` | Multi-turn, abort, title-gen timing, lifecycle | Command → channel events + history |
| `messageHandler` / `conversation.sendUserMessage$` | Single turn end-to-end | One user message → reply events + persisted shape |
| Tool factory `invoke$` | Specialist-internal — validation retry, closure interpretation, envelope shape | Args + fake LLM + fake bridge → envelope + bridge calls |
| Tool registry `invoke$` | Envelope contract — validation, error codes, unknown tool | Tool call → envelope |
| LLM port (`llm.respondTo$`) | Provider swap, cross-provider contract | Request → events |
| Pure algorithm | Single-responsibility, fast | Input → output |
| Adapter wire boundary | Translation only | Domain call → SDK / wire receives X |

Higher = setup tax. Lower = brittle to internals.

Internals are **not** seams: `runSpecialist`, `conversationLoop`'s `step$`, event publishers, formatters, dispatchers. Their behaviour surfaces through the seams above; verify there.

## Test doubles

Simplest that does the job:

- **Fake** — working stand-in (in-memory repo pushing to an array). Default.
- **Spy** — records calls. Use when *how* the collaborator was called matters.
- **Mock** — pre-programmed expectations enforced in the test. Sparingly — when order / count / args are part of the contract.

GOOSE leans on mocks for behaviour verification ("tell, don't ask"). Use when the object's job is to coordinate collaborators, not compute a value.

## Write-then-read over call-spying

Verify outcomes by observable side effect, not by asserting which internal collaborator was called.

| Brittle | Stable |
|---|---|
| `expect(store.set).toHaveBeenCalledWith(k, v)` | `await store.append$(m); expect(await store.load$()).toContain(m)` |
| `expect(tools.invoke$).toHaveBeenCalledWith(c)` | `await send$('hi'); expect(bridge.requests).toContainEqual(...)` |
| `expect(publishX).toHaveBeenCalled` | `await send$('hi'); expect(channel.events).toMatchObject([...])` |

Brittle pins HOW. Stable pins THAT.

Asserting inputs the test itself supplied is a tautology — scripted fake-LLM tool calls, the very `operations` array the test wrote, a value passed straight into the subject. It only proves the harness forwards input. Assert what production *computes* from that input (the real envelope, the packet a wired-in real tool produced, the bridge request a real adapter emitted).

For every behaviour, ask: **what side-effect surface lets me observe it?** Channel events. Persisted history. Bridge requests captured by a fake. State after the action. Returned envelope. Use those.

In-memory fakes implementing real port shapes make this cheap (e.g. an in-memory `history` supporting both `append$` and `load$` in the same test).

`jest.spyOn` / `jest.fn().mock.calls` are smells unless the test is an adapter test pinning a wire call. At every other seam: don't.

If no side-effect surface exists for a behaviour, that's design feedback — the behaviour is unobservable from outside, and either it shouldn't matter or the design must expose it.

## Tests as specifications

Test body says **what behaviour matters**. Wiring → builders, drivers, helpers in adjacent files.

Reads like a script → extract until reads like English.

**Listen.** Hard-to-write test = wrong design. Refactor production until the test is simple. Hard to test = hard to use.

**Refactor tests with the same rigor as production code.** Different priorities, same discipline: readability wins over brevity, and the main extraction tools are builders / drivers / helpers (not generic factorings). The threshold for "right abstraction" is how the test reads aloud, not how much code is removed.

## Quality bar

Stable test:

- **Every visible detail in the test relates to the behaviour being pinned.** Unrelated detail is refactor signal — extract a named builder that hides it. The bar isn't line count; it's whether each line earns its place by speaking about the behaviour.
- The `when` action lives in the `it` body — typically one call, sometimes a small sequence when the scenario genuinely needs it; never hidden in `beforeEach`.
- Assertion is on an observable side effect (channel events, persisted state, captured calls in a port-fake, returned value, written-then-read state).
- **Each assertion pins one facet of the behaviour.** Multiple assertions are fine when each speaks to a different facet; piling them on one call to hedge is noise.
- **Matcher fits the scope.** `toMatchObject` / `toContain` / `toContainEqual` for partial pins; whole-shape equality only when the whole shape **is** the contract. Whole-blob `toEqual` on a rich object pins incidental fields and breaks on unrelated changes.
- **Assertions read like domain statements.** Custom matchers (e.g. `toBeAToolCall(name)`) earn their place when the same shape recurs across tests; otherwise inline matchers are fine.
- Name reads "when X, system does Y" — outcome-shaped, not "calls X with Y."

Marker-style assertions on text content are fine — regex matching a phrase that pins **intent** without pinning **wording** (e.g. `expect(prompt).toMatch(/don't chain.*describe.*update/i)`). Verbatim string equality on the same content is a smell.

Red flags that fail review:

| Red flag | Diagnosis | Fix |
|---|---|---|
| Visible setup detail unrelated to the behaviour | Noise leaking into the test | Extract a named builder that hides it |
| Many disparate but relevant details all needed for one test | Scope too broad, or seam wrong | Split the scope; or move to a different seam where fewer details are load-bearing |
| Assertion on a value the test doesn't set or expose (harness default, production default) | Coupling to hidden state — reader can't tell what's pinned without diving into the harness/src | Surface via explicit setup, drop the assertion, or `expect.objectContaining` for the load-bearing fields only |
| `jest.fn()` / `toHaveBeenCalledWith` in a domain test | Call-spying instead of outcome assertion | Find the side-effect surface; assert on it |
| Whole-object `toEqual` on a rich shape when only a few fields are the contract | Pins too much; breaks on unrelated changes | `toMatchObject` for the fields that matter; or a custom matcher |
| Pins ordering, internal IDs, generated timestamps | Incidental detail, not contract | Sort / normalize before assertion; strip generated fields; assert on the relevant shape only |
| `not.toHaveBeenCalled` or other negative assertions on internal calls | Fragile — passes for wrong reasons | Assert on the positive observable surface |
| Test re-derives state in the body to compare against | Asserting implementation, not outcome | Assert on the captured side-effect surface directly |
| Pins event ordering, exact log strings, internal field counts | Coupled to observability detail, not contract | Reframe at the real outcome; drop the pin |
| Verbatim assertion on a log message or prompt body | Tuning surface, not contract — wording changes routinely | Assert the behaviour the log/prompt enables, not its text; or use a marker regex for intent |
| Reading the body doesn't say what behaviour is pinned | Unclear intent | Refactor the body, or move to a clearer seam |
| Same setup or same assertion shape repeated across many tests | Missing harness builder or custom matcher | Extract |
| Mocks something deep that's reachable by real collaborator | Over-mocking | Use the real collaborator; mock only at port boundaries |
| Asserts implementation constant (`MAX_TOOL_ROUNDS`, retry-mode names, etc.) | Pinning internals | Reframe at the user-observable consequence |

A test failing this bar with no fix — seam is right, no obvious refactor available — is a system-level signal. Log to `issues.md` with the rejected test, the red flag, and the alternative seams tried. Move on; don't grind.

## Nested describes for shared scenarios

Cluster tests under `describe(scenario, ...)` blocks when several tests share setup. Use `beforeEach` to construct fresh state per test — the `describe` body itself runs **once** at file load, so setup placed directly in the body would be shared across tests and break independence.

```js
describe('a thing', () => {

    describe('in scenario X', () => {
        let collaborator, subject
        beforeEach(() => {
            collaborator = aFakeCollaborator()
            subject = aSubject({collaborator})
        })

        it('does this', () => { ... })
        it('does that', () => { ... })
    })

    describe('in scenario Y', () => { ... })
})
```

Output reads as a spec — nested headings mark scenarios, each `it` says the behaviour:

```
a thing
  in scenario X
    ✓ does this
    ✓ does that
  in scenario Y
    ✓ ...
```

Use when two or more tests share a meaningful scenario. Flat is fine for one-offs. The `let` + `beforeEach` mutation pattern is canonical Jest — the mutation is scoped inside one `describe`; tests get fresh state.

## Given / when / then

The action under test — the **when** — always lives in the `it` body, never hidden in `beforeEach`. Setup (**given**) goes in `beforeEach` for shared scenarios; the assertion (**then**) follows the action. Each `it` must visibly show what it's exercising.

```js
describe('in scenario X', () => {
    let subject, collaborator
    beforeEach(() => {
        // GIVEN — shared setup
        collaborator = aFakeCollaborator()
        subject = aSubject({collaborator})
    })

    it('does this', () => {
        subject.act(input)                       // WHEN — always in the it
        expect(collaborator.calls).toEqual(...)  // THEN
    })
})
```

Per-describe `const` data is also "given" — declared at the top of the describe, referenced from both `beforeEach` and `it` bodies.

**Avoid magic literals shared between setup and assertions.** Extract to a per-describe `const` when an id, name, or other datum flows from fake setup into an assertion. Magic strings are fine when their value carries meaning (a tool name like `'recipe_list'`); they're a smell when arbitrary (a generated tool-call id like `'t1'`).

```js
describe('when the LLM asks for a tool', () => {
    const toolCall = {id: 'recipe-list', name: 'recipe_list', input: {}}

    let llm
    beforeEach(() => {
        llm = aFakeLlm({replies: [{toolCalls: [toolCall]}]})
    })

    it('invokes the tool', () => {
        run(conversation.send$('list my recipes'))
        expect(tools.invocations).toEqual([toolCall])
    })
})
```

## Test layout

Tests mirror `src/`:

```
src/<area>/<slice>/<file>.<ext>
test/<area>/<slice>/<file>.test.<ext>
```

**Exception: scenario tests organize by behaviour, not source file.** When several source files cooperate to deliver one user-facing capability, the scenario tests live in `test/<area>/scenarios/<scenario>/...` — a directory named for what the user does, not which file implements it. Each top-level sub-scenario inside the directory is its own file; the file's outermost `describe` names that sub-scenario.

```
test/chat/scenarios/
  conversationLifecycle/
    creating.test.js
    selecting.test.js
    deleting.test.js
    ...
  wsProtocol/
    frameRouting.test.js
    subscriptionLifecycle.test.js
    contextRouting.test.js
    guiBridge.test.js
    errors.test.js
  recipeEdits/
    ...
```

The scenario directory groups files under one capability; the file split keeps each file focused on one sub-area. Single-file scenarios are acceptable while a capability has only one sub-area, or as a transitional state during a structured migration — promote to a directory during scheduled cleanup when files outgrow digestible size or when a second sub-area lands.

Natural correlation between a scenario and one source surface is expected — when source is cohesive, the mapping is roughly 1:1. Don't force separation; don't force merger. Organize by what's being verified.

Adapter tests, pure-algorithm tests, and unit tests for genuinely-orthogonal contracts keep mirroring `src/`.

Top-level `test/` keeps tests out of production builds. Configure the build (Docker `COPY`, npm `files`, etc.) to ship `src/` only.

Per-slice test infrastructure (drivers, builders, harnesses) → `test/<area>/`. Start collapsed (one `harness.<ext>`). Split when files grow or cohesion suffers.

**Helpers below tests.** Within a test file, `describe` / `it` blocks come first; helper builders (`aMosaicRecipe`, `loadRecipe`, `prepareFor`, …) come after at file scope. JS function-declaration hoisting keeps references inside tests safe. Default to file scope, not describe scope, unless a helper is genuinely specific to one nested scope. A test file reads top-down: what's being pinned first, how it's set up second.

## Manual tests

Tests that hit real external systems (live APIs, real databases) are **manual** — opt-in, run occasionally, not in the default suite.

Convention:
- File naming: `*.manual.test.js`
- Excluded from the default run via `testPathIgnorePatterns`
- `npm run test:manual` runs only these

Use them sparingly:
- Verify the real adapter actually works against the real service (catch SDK / protocol drift)
- Smoke test on environment changes
- Boot-time sanity checks

Default adapter tests fake the SDK or driver; manual tests are the rare exception, not the default.

## Coverage

Run coverage **after the refactor step**, not after green. Green confirms behaviour; refactor changes the code shape, and that's when uncovered branches surface. Use `--coverage` (Jest) on the post-refactor run. Print the summary; no enforced threshold. Coverage = honesty signal, not target.

Full line + branch coverage is the expectation. Uncovered code is legitimate in exactly two cases:

1. **Wiring** — `main.js`, `app.js`, `config.js`. Kept thin and reviewed; excluded from `collectCoverageFrom`.
2. **The I/O call to an uncontrolled external** — the live `fetch` / SDK / driver invocation against the model, network, or datastore. Fake that external and test the adapter's translation logic; the real call is covered by a sparse manual test (see Manual tests).

Everything else is our code, reachable through a controllable seam, and **must** be covered — domain, composition units (`userChats`), port adapters (`redisChatStorage`), observability, and defensive paths alike:

- **Observability** (lazy `message: () => …` bodies, log-label / summary helpers): invoke the thunk, assert a marker for intent — not verbatim wording (see Quality bar). The log sink is ours; nothing here is an uncontrolled external.
- **Defensive / fatal**: force the condition (error the stream, feed the bad input); for `process.exit`, stub the boundary and assert the exit decision.

"It's just wiring," "it's only logging," and "that can't happen" are not exemptions. The sole residual exception is **provably-unreachable** code — a guard no seam can trigger — justified case-by-case in review (and usually a sign of dead code or a missing seam), never a standing category.

## Refactor lens

Questions to ask while green:

- **Scope includes what you touched** — refactor pre-existing smells in the code you're already editing, not just your own additions. Leave each file better than you found it. (Don't expand into unrelated rewrites — "the area you touched," not "the whole file.")
- **Cohesion** — the top question. Function / file / slice / module each have one job. See the Cohesion section.
- **Top-down reading**: outer function = few named calls at one abstraction level. Details one level deeper. No mixed abstraction levels in one function — extract.
- **Short functions, few args, descriptive names**. Rename until the code self-explains.
- **DRY vs coupling**: dedupe when it's *the same idea*, not just code that looks alike. Different ideas that look alike → leave.
- **No premature abstractions**. Two or three real uses, or a concrete reason (test seam, pluggable strategy). Inline duplication beats a wrong abstraction. **Single-use helpers earn extraction only when the name reveals something the inlined code obscures** — not when they merely shrink the parent function. Cosmetic extraction fragments the flow and forces readers to jump between functions to follow a single chain.
- **Comment discipline** — prefer deletion over rewriting. Keep comments only for non-obvious invariants, safety boundaries, wire contracts, or gotchas the code cannot express.
- No comments that list current consumers, narrate history, restate workflow steps, explain what a function name already says, or defend a local design choice that belongs in a design doc.
- Durable architecture → `DESIGN_*.md`. Executable contracts → tests with names/assertions that pin the rule. Code comments stay local and operational.
- Reaching for a comment → first try naming/extraction. If the comment survives, make it about the invariant, not the implementation tour.
- **No circular deps**, file or slice. Slices collaborate through constructor-injected ports, exported entry points, and composition; never through hidden internals.
- **Importance first**: most relevant at top of file / function. Helpers below callers.
- **Cyclomatic complexity** climbing → extraction signal.
- **Prefer immutability**: rebind variables, copy via spread, return new values rather than mutating in place. Mutation acceptable when encapsulated *and* the functional alternative would be purely cosmetic — when the state has to exist somewhere, rebinding for its own sake is dressing, not honesty. Default is functional; reach for mutation when functional buys nothing.

## References

- *Growing Object-Oriented Software, Guided by Tests* — Freeman & Pryce.
