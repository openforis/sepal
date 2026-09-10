import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {defer, lastValueFrom, Observable, of, switchMap, throwError, toArray} from 'rxjs'

// The backend execution contract for recursive recipe references, exercised through the REAL imageFactory,
// recipeRef, loadRecipe$ and recipe implementations. Only the two external boundaries are replaced - the HTTP
// client that fetches a recipe, and Earth Engine - so the recursion under test is the one production
// performs.
//
// Run by Node's own test runner rather than Jest, because imageFactory loads every implementation through
// createRequire. Real Node supports require(esm); Jest's CJS resolver refuses it with ERR_REQUIRE_ESM, so
// under Jest the factory throws before any recursion can happen. This file is launched from a Jest bridge so
// the witness still runs in the ordinary gee gate.
//
// The catalogue's fail-safe is not part of the contract. It is a regression safeguard: if the guard were
// removed or broken, these cases would loop until the runner timed out, and a timeout says nothing about what
// went wrong. Capping the requests turns that into a named failure naming the sequence it saw. The guard
// rejects long before it, so it never fires while the guard works.

const TEST_RECURSION_LIMIT = 'TEST_RECURSION_LIMIT'
const MAX_REQUESTS = 6

let catalogue = {}
// loadRecipe$ calls http.get$ while CONSTRUCTING its Observable; the real client defers the network request
// until someone subscribes. Both are recorded and both are asserted, because "was the reference built" and
// "was the recipe fetched" are different questions and the guard answers both: it rejects before
// loadRecipe$ is constructed, so a recipe closing a cycle is neither fetched nor prepared to be.
let referencesBuilt = []
let recipesRequested = []
let loadsCancelled = []
// 0 keeps every load synchronous, which makes request sequences deterministic. Cancellation needs a load that
// is still in flight, so that test raises it.
let loadDelayMs = 0

mock.module('#sepal/context', {
    exports: {
        context: () => ({sepalEndpoint: 'http://test', sepalUsername: 'test', sepalPassword: 'test'}),
        configure: () => {}
    }
})

mock.module('#sepal/httpClient', {
    exports: {
        get$: url => {
            const id = url.split('/').pop()
            referencesBuilt.push(id)
            return defer(() => {
                recipesRequested.push(id)
                if (recipesRequested.length > MAX_REQUESTS) {
                    return throwError(() => new Error(TEST_RECURSION_LIMIT))
                }
                const recipe = catalogue[id]
                // loadRecipe$ asks for `json`, and the real client hands back a parsed body.
                const response = recipe
                    ? of({body: recipe})
                    : throwError(() => new Error(`No such recipe: ${id}`))
                if (!loadDelayMs) {
                    return response
                }
                // An in-flight load, so a subscriber can be torn down while one is pending. The teardown is
                // recorded, which is how cancellation is observed without reaching into production.
                return new Observable(subscriber => {
                    const timer = setTimeout(() => response.subscribe(subscriber), loadDelayMs)
                    return () => {
                        loadsCancelled.push(id)
                        clearTimeout(timer)
                    }
                })
            })
        }
    }
})

// Earth Engine is an external boundary like the HTTP client. Mocked to the minimum the operations under test
// need: bands for getBands$, and select/updateMask so masking's getImage$ can combine two branches instead of
// failing before both have been executed.
const eeImage = id => ({
    id,
    bandNames: () => [`${id}:band`],
    select: () => eeImage(`${id}.selected`),
    updateMask: mask => eeImage(`${id} masked by ${mask.id}`)
})

mock.module('#sepal/ee/ee', {
    defaultExport: {
        getAsset$: () => of({type: 'Image'}),
        getInfo$: value => of(value),
        Image: eeImage
    }
})

const {default: imageFactory} = await import('#sepal/ee/imageFactory')
const {toException} = await import('#sepal/exception')
const {withPath} = await import('#sepal/ee/executionPath')

const recipeRef = id => ({type: 'RECIPE_REF', id})

const masking = (id, imageToMask) => ({id, type: 'MASKING', model: {imageToMask}})

const rejectionOf = async recipe => {
    try {
        await lastValueFrom(imageFactory(recipe).getBands$())
        return {rejected: false}
    } catch (error) {
        return {rejected: true, error}
    }
}

const asset = id => ({type: 'ASSET', id})

const maskedBy = (id, imageToMask, imageMask) => ({id, type: 'MASKING', model: {imageToMask, imageMask}})

const slice = (id, source) => ({
    id, type: 'CCDC_SLICE', model: {source, date: {date: '2020-06-01'}, options: {}}
})

const resultOf = recipe => lastValueFrom(imageFactory(recipe).getBands$())

// masking.js's getBands$ delegates to the primary input alone - it has no reason to read the mask - so a
// cycle through the mask is only reachable through getImage$, which zips both. The rejection happens while
// the mask is being loaded, long before any Earth Engine arithmetic on the result.
const imageRejectionOf = async recipe => {
    try {
        await lastValueFrom(imageFactory(recipe).getImage$())
        return {rejected: false}
    } catch (error) {
        return {rejected: true, error}
    }
}

beforeEach(() => {
    catalogue = {}
    referencesBuilt = []
    recipesRequested = []
    loadsCancelled = []
    loadDelayMs = 0
})

describe('a recipe that references itself', () => {
    // A --imageToMask--> A
    const selfReferencing = () => {
        catalogue = {A: masking('A', recipeRef('A'))}
        return masking('A', recipeRef('A'))
    }

    it('is rejected with a controlled cycle diagnosis', async () => {
        const {rejected, error} = await rejectionOf(selfReferencing())
        assert.equal(rejected, true, 'expected a rejection')
        assert.ok(
            !String(error?.message).includes(TEST_RECURSION_LIMIT),
            `reached the fail-safe after requesting ${JSON.stringify(recipesRequested)}`
        )
        assert.equal(error?.code, 'CYCLIC_DEPENDENCY')
        assert.deepEqual(error?.recipePath, ['A', 'A'])
    })

    // Detection has to happen BEFORE the request that closes the cycle: a guard that noticed afterwards would
    // still cost one round trip per lap, which is what this exists to prevent.
    it('never requests the recipe that closes the cycle', async () => {
        await rejectionOf(selfReferencing())
        assert.deepEqual(recipesRequested, [])
    })

    // Stronger than not requesting it: the load is never even built. The guard runs before loadRecipe$ is
    // constructed, so no reference to the closing recipe exists to be subscribed by anything.
    it('never builds a load for the recipe that closes the cycle', async () => {
        await rejectionOf(selfReferencing())
        assert.deepEqual(referencesBuilt, [])
    })
})

describe('a cycle through a second recipe', () => {
    // A --imageToMask--> B --imageToMask--> A
    const indirect = () => {
        catalogue = {
            A: masking('A', recipeRef('B')),
            B: masking('B', recipeRef('A'))
        }
        return masking('A', recipeRef('B'))
    }

    it('is rejected with the complete closing path', async () => {
        const {rejected, error} = await rejectionOf(indirect())
        assert.equal(rejected, true, 'expected a rejection')
        assert.ok(
            !String(error?.message).includes(TEST_RECURSION_LIMIT),
            `reached the fail-safe after requesting ${JSON.stringify(recipesRequested)}`
        )
        assert.equal(error?.code, 'CYCLIC_DEPENDENCY')
        assert.deepEqual(error?.recipePath, ['A', 'B', 'A'])
    })

    it('requests only the recipes on the path before the closing edge', async () => {
        await rejectionOf(indirect())
        assert.deepEqual(recipesRequested, ['B'])
    })

    it('builds a load only for the recipes on the path before the closing edge', async () => {
        await rejectionOf(indirect())
        assert.deepEqual(referencesBuilt, ['B'])
    })
})

describe('a cycle closed across an asynchronous load', () => {
    // The same A -> B -> A cycle, but with the load in flight rather than resolving synchronously.
    //
    // This is the case that separates branch-local ancestry from a single shared one. A shared path can only
    // be saved and restored around a synchronous call; once the recipe arrives on a later tick the restore has
    // already run, and every loaded recipe looks like a fresh root. The cycle is then either missed or
    // reported from the wrong place, and an extra recipe is fetched on the way.
    const indirectAsync = () => {
        loadDelayMs = 20
        catalogue = {
            A: masking('A', recipeRef('B')),
            B: masking('B', recipeRef('A'))
        }
        return masking('A', recipeRef('B'))
    }

    it('is rejected with the path from the original root', async () => {
        const {rejected, error} = await rejectionOf(indirectAsync())
        assert.equal(rejected, true, 'expected a rejection')
        assert.equal(error?.code, 'CYCLIC_DEPENDENCY')
        assert.deepEqual(error?.recipePath, ['A', 'B', 'A'])
    })

    it('requests only the recipes on the path before the closing edge', async () => {
        await rejectionOf(indirectAsync())
        assert.deepEqual(recipesRequested, ['B'])
    })
})

describe('a cycle through the mask input', () => {
    // A --imageMask--> B --imageToMask--> A
    //
    // masking.js forwards its caller's `...args` to the primary input and deliberately withholds them from the
    // mask. Ancestry must not inherit that asymmetry: a cycle through a mask is still a cycle, and this is the
    // case that fails if execution context is smuggled inside those arguments.
    const throughMask = () => {
        catalogue = {
            A: maskedBy('A', asset('projects/p/assets/base'), recipeRef('B')),
            B: masking('B', recipeRef('A'))
        }
        return maskedBy('A', asset('projects/p/assets/base'), recipeRef('B'))
    }

    it('is rejected with the complete closing path', async () => {
        const {rejected, error} = await imageRejectionOf(throughMask())
        assert.equal(rejected, true, 'expected a rejection')
        assert.equal(error?.code, 'CYCLIC_DEPENDENCY')
        assert.deepEqual(error?.recipePath, ['A', 'B', 'A'])
    })

    it('requests only the recipes on the path before the closing edge', async () => {
        await imageRejectionOf(throughMask())
        assert.deepEqual(recipesRequested, ['B'])
    })
})

describe('a cycle spanning two recipe types', () => {
    // A (MASKING) --imageToMask--> S (CCDC_SLICE) --source--> A
    //
    // Two different implementations, two different model fields. Nothing about the guard is Masking-shaped.
    const mixedType = () => {
        catalogue = {
            A: masking('A', recipeRef('S')),
            S: slice('S', recipeRef('A'))
        }
        return masking('A', recipeRef('S'))
    }

    it('is rejected with the complete closing path', async () => {
        const {rejected, error} = await rejectionOf(mixedType())
        assert.equal(rejected, true, 'expected a rejection')
        assert.equal(error?.code, 'CYCLIC_DEPENDENCY')
        assert.deepEqual(error?.recipePath, ['A', 'S', 'A'])
    })

    it('requests only the recipes on the path before the closing edge', async () => {
        await rejectionOf(mixedType())
        assert.deepEqual(recipesRequested, ['S'])
    })
})

describe('an acyclic chain', () => {
    // A --> B --> C --> asset. Nothing about ordinary execution may change.
    const chain = () => {
        catalogue = {
            B: masking('B', recipeRef('C')),
            C: masking('C', asset('projects/p/assets/base'))
        }
        return masking('A', recipeRef('B'))
    }

    it('produces its result', async () => {
        assert.deepEqual(await resultOf(chain()), ['projects/p/assets/base:band'])
    })

    it('requests each recipe on the chain once, in order', async () => {
        await resultOf(chain())
        assert.deepEqual(recipesRequested, ['B', 'C'])
    })
})

describe('a diamond', () => {
    // A reaches S down BOTH of its inputs: L through the primary, R through the mask. The operation is
    // getImage$, because that is the one that zips the two branches - getBands$ reads only the primary and
    // would leave the second half of the diamond unexecuted.
    //
    // The same recipe on two SIBLING paths is not a cycle; only a repeat on the SAME path is.
    // Every recipe here carries both inputs, because masking's getImage$ zips them and has nothing to zip
    // against a missing mask.
    const diamond = () => {
        const cover = asset('projects/p/assets/cover')
        catalogue = {
            L: maskedBy('L', recipeRef('S'), cover),
            R: maskedBy('R', recipeRef('S'), cover),
            S: maskedBy('S', asset('projects/p/assets/base'), cover)
        }
        return maskedBy('A', recipeRef('L'), recipeRef('R'))
    }

    it('executes both branches without a cycle diagnosis', async () => {
        const {rejected, error} = await imageRejectionOf(diamond())
        assert.equal(rejected, false, `unexpected rejection: ${error?.message}`)
    })

    // Once through each branch. A cross-branch visited set would request S once and leave the second branch
    // unresolved; a path that never shrinks would see S again and call the second branch a cycle.
    it('requests the shared recipe exactly once per branch', async () => {
        await imageRejectionOf(diamond())
        assert.deepEqual(recipesRequested, ['L', 'S', 'R', 'S'])
    })
})

describe('two concurrent evaluations', () => {
    // Overlapping ids, opposite outcomes. A global active set would let the cyclic one poison the clean one,
    // or the clean one mask the cyclic one, depending on interleaving.
    it('keeps their ancestries independent', async () => {
        // Loads are made asynchronous so the two evaluations genuinely interleave. With synchronous loads
        // they would run to completion one after the other, and even a single shared path would survive -
        // the interleaving is the whole point of the case.
        loadDelayMs = 20
        catalogue = {
            S: masking('S', asset('projects/p/assets/base')),
            X: masking('X', recipeRef('S')),
            Y: masking('Y', recipeRef('X'))
        }
        const clean = resultOf(masking('clean', recipeRef('Y')))
        const cyclic = rejectionOf(masking('X', recipeRef('X')))
        const [cleanResult, cyclicResult] = await Promise.all([clean, cyclic])

        assert.deepEqual(cleanResult, ['projects/p/assets/base:band'])
        assert.equal(cyclicResult.error?.code, 'CYCLIC_DEPENDENCY')
        assert.deepEqual(cyclicResult.error?.recipePath, ['X', 'X'])
    })
})

describe('cancellation while a recipe is loading', () => {
    // Teardown has to reach the pending load, and nothing further may be requested afterwards. An
    // implementation that subscribed internally to establish context would keep the load alive.
    it('tears the load down and starts no further load', async () => {
        loadDelayMs = 50
        catalogue = {
            B: masking('B', recipeRef('C')),
            C: masking('C', asset('projects/p/assets/base'))
        }
        const subscription = imageFactory(masking('A', recipeRef('B'))).getBands$().subscribe({
            error: () => {}
        })
        await new Promise(resolve => setTimeout(resolve, 10))
        assert.deepEqual(recipesRequested, ['B'], 'the first load should be in flight')
        subscription.unsubscribe()
        await new Promise(resolve => setTimeout(resolve, 100))
        assert.deepEqual(loadsCancelled, ['B'])
        assert.deepEqual(recipesRequested, ['B'], 'no further recipe may be requested after teardown')
    })
})

describe('a parent that evaluates the same input twice', () => {
    // The shape a Classification has: it evaluates its input imagery, and then - DOWNSTREAM of that result,
    // inside an operator reacting to it - evaluates the same input again for its training data. Reproduced
    // here at the caller rather than with a Classification fixture, because what matters is where
    // imageFactory is CALLED: inside an operator running on a child's notification.
    //
    // Two independent evaluations of one input are not a cycle. Ancestry is a property of the path taken to
    // reach a recipe, not of how many times a parent chooses to read it.
    const reevaluating = () => {
        catalogue = {B: masking('B', asset('projects/p/assets/base'))}
        return masking('A', recipeRef('B'))
    }

    const evaluateTwice = root =>
        lastValueFrom(
            imageFactory(root).getBands$().pipe(
                switchMap(() => imageFactory(root).getBands$())
            )
        )

    it('is not diagnosed as cyclic', async () => {
        try {
            assert.deepEqual(await evaluateTwice(reevaluating()), ['projects/p/assets/base:band'])
        } catch (error) {
            assert.fail(`unexpected rejection: ${error?.code} ${JSON.stringify(error?.recipePath)} - ${error?.message}`)
        }
    })

    it('requests the input once per evaluation', async () => {
        await evaluateTwice(reevaluating()).catch(() => {})
        assert.deepEqual(recipesRequested, ['B', 'B'])
    })
})

describe('a parent that already has ancestry of its own', () => {
    // The cases above run at the top level, where the caller's ancestry is empty - so restoring the CALLER's
    // path and restoring an empty one look identical. In production the caller is always a recipe partway
    // down a graph, and the difference is the whole point: restoring the wrong thing there either invents a
    // cycle or misses one.
    //
    // withPath is the production function that establishes ancestry; using it here states "a recipe called
    // P is doing this work" without needing a recipe type that evaluates its input twice.
    const asRecipe = (id, work) => withPath([id], work)

    it('still reaches a real cycle after a child notification', async () => {
        catalogue = {
            B: masking('B', asset('projects/p/assets/base')),
            P: masking('P', asset('projects/p/assets/base'))
        }
        const {rejected, error} = await asRecipe('P', async () => {
            try {
                await lastValueFrom(
                    imageFactory(masking('B', recipeRef('B'))).getBands$().pipe(
                        switchMap(() => imageFactory(recipeRef('P')).getBands$())
                    )
                )
                return {rejected: false}
            } catch (caught) {
                return {rejected: true, error: caught}
            }
        })
        // Restoring [] instead of the caller's path would lose P from the ancestry and let this through.
        assert.equal(rejected, true, 'a reference back to the calling recipe must still be a cycle')
        assert.equal(error?.code, 'CYCLIC_DEPENDENCY')
        assert.deepEqual(error?.recipePath, ['P', 'P'])
    })

    // concat does NOT discriminate this: RxJS subscribes its next source outside the completing context, so
    // it sees the caller's ancestry either way - proven by mutating complete and watching it still pass. An
    // operator that EMITS on complete does. toArray produces its value from the completion notification, so
    // whatever context that notification carries is the one a downstream factory is built in.
    it('builds a factory from a completion notification in the caller ancestry', async () => {
        catalogue = {B: masking('B', asset('projects/p/assets/base'))}
        const result = await asRecipe('P', () =>
            lastValueFrom(
                imageFactory(recipeRef('B')).getBands$().pipe(
                    toArray(),
                    switchMap(() => imageFactory(recipeRef('B')).getBands$())
                )
            ).catch(error => error)
        )
        assert.equal(result?.code, undefined, `unexpected rejection: ${result?.code} ${JSON.stringify(result?.recipePath)}`)
        assert.deepEqual(recipesRequested, ['B', 'B'])
    })
})

describe('the service boundary', () => {
    // A plain Error is re-wrapped by toException into a generic ServerException: status 500, no error code,
    // and the diagnosis buried in `cause`. The GUI would be told "Internal error" about a recipe the user can
    // actually fix. The classification has to survive the boundary the worker and HTTP server both use.
    it('carries the cycle through toException as a client error', async () => {
        catalogue = {A: masking('A', recipeRef('A'))}
        const {error} = await rejectionOf(masking('A', recipeRef('A')))
        const exception = toException(error)

        assert.equal(exception.code, 'CYCLIC_DEPENDENCY')
        assert.equal(exception.errorCode, 'CYCLIC_DEPENDENCY')
        assert.deepEqual(exception.recipePath, ['A', 'A'])
        assert.ok(String(exception.message).includes('A -> A'), `message was: ${exception.message}`)
        assert.ok(
            exception.statusCode >= 400 && exception.statusCode < 500,
            `expected a client status, got ${exception.statusCode}`
        )
    })
})

describe('a root with no id', () => {
    // An inline root cannot name itself, so it contributes nothing to the path and can never be reported as a
    // cycle node. Everything it REFERENCES is still protected, which is the achievable guarantee: the id a
    // recipe is known by enters the path when a reference to it is followed.
    it('still protects the recipes it references', async () => {
        catalogue = {A: masking('A', recipeRef('A'))}
        const {rejected, error} = await rejectionOf({type: 'MASKING', model: {imageToMask: recipeRef('A')}})
        assert.equal(rejected, true, 'expected a rejection')
        assert.equal(error?.code, 'CYCLIC_DEPENDENCY')
        assert.deepEqual(error?.recipePath, ['A', 'A'])
    })

    it('requests the referenced recipe once and stops', async () => {
        catalogue = {A: masking('A', recipeRef('A'))}
        await rejectionOf({type: 'MASKING', model: {imageToMask: recipeRef('A')}})
        assert.deepEqual(recipesRequested, ['A'])
    })
})
