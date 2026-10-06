# Code design

Component responsibilities, boundary contracts and how to test them.
Coding conventions and test-writing practices: [CLAUDE.md](../CLAUDE.md).

## Proportionality

Extract a boundary when it clarifies responsibility or makes a meaningful behavioral test straightforward.
Leave existing structure alone when the task does not need that separation. Not every role needs a
separate class or file; do not restructure a whole module before testing its behavior.

Share behavior when it represents the same policy, not because unrelated policies look similar.
Reuse adapters that fit; add no speculative operations or wrappers solely to name a port.

## Complexity and extension APIs

Keep domain-specific implementations focused on their own rules behind small, explicit APIs. Shared machinery
may be complex when it owns a recurring responsibility and removes that complexity from each implementation.
Judge the design by what an implementor must understand, supply and change, rather than total line count alone.
The contract should make inputs, results, failures and lifecycle ownership clear.

Moving type-specific branches into a shared file does not make them generic. A shared component must own a
cohesive responsibility and replace its competing implementations; it must not require each caller to reconstruct
the same behavior. Keep intrinsic algorithms and policies with their domain owner. Establish extension APIs from
real consumers rather than building a speculative framework.

## Ports and adapters

Ports are the application's boundary contracts. Inbound adapters call its public operations. Outbound
adapters implement the contracts it uses for storage, communication, time and randomness.
Use duck-typed objects or functions; no mandatory interface files, inheritance, naming scheme, directory
structure or dependency-injection framework.

- Application code owns business rules, state transitions and workflow ordering. It depends on contracts,
  not concrete adapters. Inject collaborators, including clocks and randomness used in decisions,
  rather than using mutable globals or service locators. Do not add fallback implementations or
  boilerplate presence/type checks for required collaborators. Keep defaults where production callers
  intentionally use them.
- Inbound adapters translate requests, messages and jobs into application calls and translate results
  back. They authenticate callers and pass trusted identities; application code decides what they may do.
- Outbound adapters keep SQL, serialization, protocol handling and resource management out of application
  code. A pure query builder or codec belongs here when it represents a storage format or protocol.

Responsibilities may cooperate: application code decides what must change together; a repository enforces
atomicity. Application validation and database constraints may enforce the same requirement. Avoid
independent definitions of the same policy that can drift, not repeated enforcement of that policy.

## Contracts

- In both directions, exchange application or plain values, not Koa contexts, BullMQ jobs, mysql2
  connections or provider response objects. A scheduler may return a token to pass back for cancellation;
  define how long it remains valid, and keep its internal job object behind the adapter.
- State what each operation's success means. Queued, committed and delivered are different guarantees;
  returning successfully must not imply an effect has finished when it has only been scheduled.
- Distinguish absence from failure. An unavailable database is not an empty database. Preserve failure
  causes rather than letting callers mistake an outage for missing data.
- Application code specifies acceptable timing, ordering and concurrent effects. Adapters implement
  scheduling, atomicity and retries; repeating an operation must preserve those guarantees.

## Composition and lifetimes

The composition root, normally `main.js`, selects implementations, injects dependencies and owns startup
and cleanup. It may delegate a shared lifetime, such as a connection with its queues and workers, to a
component explicitly responsible for starting and closing them. Start consumers only after dependencies
are ready; clean up on shutdown and failed startup. Application constructors and imports do not start I/O.

Trace wiring from the composition root; identify roles by their boundaries, not where they are constructed.
[Recipe's wiring](../modules/recipe/src/main.js), with setup omitted:

```js
const repository = new RecipeRepository(db)
const recipeService = new RecipeService(repository)
const routes = createRoutes({recipeService, requireAuth})
```

`RecipeService` is application code; `RecipeRepository` is its persistence adapter. The routes are an
inbound adapter: they extract `principal` and `recipeId` from HTTP and call `recipeService.loadRecipe`.

Shared `db.withTransaction` and `db.withConnection` belong inside persistence adapters. Keep connection
and session-lock cleanup explicit: transaction commit or rollback does not release a MySQL named lock.

## Validation across model properties

Design guidance for forms whose fields or sections depend on each other; not a claim that existing forms implement
it. This applies to ordinary model values and derived results as well as recipe or asset references.

Keep three responsibilities distinct:

- **Feasibility:** can a proposed value participate in any supported configuration? When the domain rule establishes
  that it cannot, reject it at its own field. An unknown answer is not established incompatibility.
- **Compatibility:** do the currently selected values work together? A feasible edit may require corrections in
  other sections. Attribute each error to the actionable field, keep the affected section visibly invalid after
  Apply, and block only the operations that require that configuration. Define which incompatibilities refuse the
  current panel's Apply and which allow a repairable intermediate configuration.
- **Invalidation:** is a derived result still current after its inputs change? An out-of-date result may simply need
  recomputation; it does not by itself mean any selected value is invalid or that a warning is useful.

Declare rule inputs, owning sections, actionable fields and affected operations rather than coordinating panels
with callbacks. Pure domain rules consume model values and any required facts; shared form machinery routes their
results and enforces Apply. Evidence acquisition and currency apply only where rules need external facts, through
the existing owner. Source discovery is one possible collaborator, not the owner of general validation. Settle the
declaration shape against concrete consumers, without introducing a general constraint solver. Where feasibility
depends on combinations, independently available options do not prove that a valid combination exists.

Presentation policy:

- Prefer preventing established invalid combinations through available choices. Do not interpret pending or failed
  reads as proof that choices are incompatible.
- Use ordinary field errors, warnings and existing busy indications. Put the explanation where the user can act;
  do not insert status rows that change form height or repeat every dependent error at the field being edited.
- Cross-section advisories are deliberate domain decisions, not an automatic consequence of dependency edges or
  invalidation. Use one short aggregate advisory when an edit leaves retained settings incompatible and advance
  notice helps the user choose whether to proceed. Name the affected sections and the available remedies. Update
  it as problems are resolved and remove it when none remain. Normal recalculation need not produce a warning.
- Preserve explicit user settings during validation. Defaulting, reconciling obsolete selections and discarding or
  regenerating derived results are separate policies; define them rather than hiding them inside validation.
- Apply the same rules to the edited candidate and committed configuration, and recheck at submission. Optional
  operations can be unavailable without making the whole configuration invalid.

For example, changing a Change Alerts reference can leave its monitoring type incompatible: REF shows an aggregate
advisory, while the Sources toolbar button is marked, saying to change the type. Changing a Sampling Design AOI can invalidate derived results without
making the AOI unsuitable. Review which settings truly become incompatible, which results only need recalculation,
and whether any loss of user work warrants advance notice before adding AOI warnings. No blanket warning policy is
implied for that recipe.

## Test boundaries

| Test | What it proves |
|---|---|
| Application operation | Business decisions, effects and failures through the real workflow. |
| Outbound adapter | Exercise the real protocol or infrastructure to verify persistence, constraints, locking and translation. |
| Inbound adapter | Verify input mapping, authentication, wire format and error handling. |
| Composed workflow | Representative paths through real wiring, not constructor arguments or prototype structure. |

Prefer real collaborators or small stateful fakes of application contracts. Arrange and observe through
those contracts, for example save then load. Mock only owned boundaries when real collaborators or fakes
would make the test less focused; do not recreate third-party internals.
A simulated failure proves the application's response, not that the real infrastructure produces it.
Do not repeat every application scenario through HTTP. Test a pure rule directly when it has meaningful
inputs and outputs independent of the workflow.

Database test setup: [migrations](database-migrations.md) and
[shared test support](../lib/js/shared/CLAUDE.md#test-support).
