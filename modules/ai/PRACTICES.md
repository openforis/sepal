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

## Test doubles

Simplest that does the job:

- **Fake** — working stand-in (in-memory repo pushing to an array). Default.
- **Spy** — records calls. Use when *how* the collaborator was called matters.
- **Mock** — pre-programmed expectations enforced in the test. Sparingly — when order / count / args are part of the contract.

GOOSE leans on mocks for behaviour verification ("tell, don't ask"). Use when the object's job is to coordinate collaborators, not compute a value.

## Tests as specifications

Test body says **what behaviour matters**. Wiring → builders, drivers, helpers in adjacent files.

Reads like a script → extract until reads like English.

**Listen.** Hard-to-write test = wrong design. Refactor production until the test is simple. Hard to test = hard to use.

**Refactor tests with the same rigor as production code.** Different priorities, same discipline: readability wins over brevity, and the main extraction tools are builders / drivers / helpers (not generic factorings). The threshold for "right abstraction" is how the test reads aloud, not how much code is removed.

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

Top-level `test/` keeps tests out of production builds. Configure the build (Docker `COPY`, npm `files`, etc.) to ship `src/` only.

Per-slice test infrastructure (drivers, builders, matchers) → `test/<area>/<slice>/`. Start collapsed (one `builders.<ext>`). Split when files grow or cohesion suffers.

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

Run coverage **after the refactor step**, not after green. Green confirms behaviour; refactor changes the code shape, and that's when uncovered branches surface. Use `--coverage` (Jest) on the post-refactor run. Print the summary; no enforced threshold yet. Coverage = honesty signal, not target.

## Refactor lens

Questions to ask while green:

- **Scope includes what you touched** — refactor pre-existing smells in the code you're already editing, not just your own additions. Leave each file better than you found it. (Don't expand into unrelated rewrites — "the area you touched," not "the whole file.")
- **Cohesion** — the top question. Function / file / slice / module each have one job. See the Cohesion section.
- **Top-down reading**: outer function = few named calls at one abstraction level. Details one level deeper. No mixed abstraction levels in one function — extract.
- **Short functions, few args, descriptive names**. Rename until the code self-explains.
- **DRY vs coupling**: dedupe when it's *the same idea*, not just code that looks alike. Different ideas that look alike → leave.
- **No premature abstractions**. Two or three real uses, or a concrete reason (test seam, pluggable strategy). Inline duplication beats a wrong abstraction. **Single-use helpers earn extraction only when the name reveals something the inlined code obscures** — not when they merely shrink the parent function. Cosmetic extraction fragments the flow and forces readers to jump between functions to follow a single chain.
- **Comments only when code can't say it** — constraint, workaround, non-obvious invariant. No "what" comments. Reaching for one → extract & name.
- **No circular deps**, file or slice. Slices collaborate through constructor-injected ports, exported entry points, and composition; never through hidden internals.
- **Importance first**: most relevant at top of file / function. Helpers below callers.
- **Cyclomatic complexity** climbing → extraction signal.
- **Prefer immutability**: rebind variables, copy via spread, return new values rather than mutating in place. Mutation acceptable when encapsulated *and* the functional alternative would be purely cosmetic — when the state has to exist somewhere, rebinding for its own sake is dressing, not honesty. Default is functional; reach for mutation when functional buys nothing.

## References

- *Growing Object-Oriented Software, Guided by Tests* — Freeman & Pryce.
