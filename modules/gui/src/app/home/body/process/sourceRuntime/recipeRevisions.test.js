import {legacy_createStore as createStore} from 'redux'
import {Observable} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

// Whether an answer is still about the recipes storage holds. A real store, the real Redux adapter, runtime, closure
// completion, observer, common read and Retrieve read; storage and Earth Engine are counting fakes that answer only
// when a test says so. Each change reaches the runtime the way it reaches it in the application: as a dispatch.

const fake = vi.hoisted(() => ({loads: [], bands: [], listings: [], stored: {}}))

vi.mock('~/apiRegistry', () => ({default: {
    recipe: {
        load$: id => new Observable(subscriber => {
            fake.loads.push({id, subscriber})
        }),
        loadAll$: () => new Observable(subscriber => {
            fake.listings.push(subscriber)
        })
    },
    gee: {
        bands$: request => new Observable(subscriber => {
            fake.bands.push({request, subscriber})
        })
    }
}}))

vi.mock('~/translate', () => ({msg: key => key}))

vi.mock('~/store', () => ({
    select: () => {
        throw new Error('source runtime must not use the singleton select()')
    },
    subscribe: () => {
        throw new Error('source runtime must not use the singleton subscribe()')
    }
}))

const {buildMapDependencyGraph} = await import('../recipe/mapDependencyGraph')
const {readRecipeOutput} = await import('../recipe/recipeOutput')
const {readRetrieveOutput, retrieveDecision} = await import('../recipe/retrieveOutput')
const {createReduxSourceEnvironment} = await import('./reduxSourceEnvironment')
const {recordStalenessOfState} = await import('./recordCurrency')
const {createSourceRuntime} = await import('./sourceRuntime')
const {actionBuilder} = await import('~/action-builder')

beforeEach(() => {
    fake.loads = []
    fake.bands = []
    fake.listings = []
    fake.stored = {}
})

describe('a dependency loaded privately', () => {
    it('is loaded again, once, when storage lists a newer revision, withdrawn in the dispatch that says so', () => {
        const session = sessionHolding([masking()], {listing: [listed(masking()), listed(bandMath(3))]})
        store(bandMath(3))
        session.watch('masking-1')
        answerLoads()
        answerBands()
        expect(bandNames(session.read('masking-1'))).toEqual(['scaled3'])

        store(bandMath(4))
        session.list([listed(masking()), listed(bandMath(4))])

        expect(session.read('masking-1').status).toBe('NEEDS_EVIDENCE')
        answerLoads()
        answerBands()
        expect(fake.loads.map(({id}) => id)).toEqual(['band-math-1', 'band-math-1'])
        expect(bandNames(session.read('masking-1'))).toEqual(['scaled4'])
    })

    // Retained after its consumer closed, the answer is watched by nothing that would hear the listing move on.
    it('is not reused once a newer revision is known, even while nothing watches it', () => {
        const session = sessionHolding([masking()], {listing: [listed(masking()), listed(bandMath(3))]})
        store(bandMath(3))
        const consumer = session.watch('masking-1')
        answerLoads()
        answerBands()
        consumer.unsubscribe()

        session.list([listed(masking()), listed(bandMath(4))])
        session.watch('masking-1')

        expect(fake.loads).toHaveLength(2)
        expect(session.read('masking-1').status).toBe('NEEDS_EVIDENCE')
    })

    it('is not loaded again when another recipe advances', () => {
        const session = sessionHolding([masking()], {listing: [listed(masking()), listed(bandMath(3))]})
        store(bandMath(3))
        session.watch('masking-1')
        answerLoads()
        answerBands()

        session.list([listed(masking()), listed(bandMath(3)), {...listed(mosaic()), revision: 9}])

        expect(fake.loads).toHaveLength(1)
        expect(fake.bands).toHaveLength(1)
        expect(session.read('masking-1').status).toBe('READY')
    })

    // The record arrived, then storage was seen to move on while Earth Engine was still describing it.
    it('installs nothing a late answer says once a newer revision is known, and describes the newer one once', () => {
        const session = sessionHolding([masking()], {listing: [listed(masking()), listed(bandMath(3))]})
        store(bandMath(3))
        session.watch('masking-1')
        answerLoads()

        store(bandMath(4))
        session.list([listed(masking()), listed(bandMath(4))])
        answerBands(fake.bands[0])

        expect(session.read('masking-1').status).toBe('NEEDS_EVIDENCE')
        answerLoads()
        answerBands()
        expect(fake.bands).toHaveLength(2)
        expect(bandNames(session.read('masking-1'))).toEqual(['scaled4'])
    })

    // Found while completing the closure: storage answers with a revision the listing has already moved past.
    it('is read again once when it arrives older than the listing, and held as a failure if it does again', () => {
        const session = sessionHolding([masking()], {listing: [listed(masking()), listed(bandMath(4))]})
        store(bandMath(3))
        session.watch('masking-1')

        answerLoads()
        answerLoads()

        expect(fake.loads).toHaveLength(2)
        expect(fake.bands).toEqual([])
        expect(session.read('masking-1')).toMatchObject({status: 'UNAVAILABLE', error: {code: 'SOURCE_REVISION_BEHIND'}})
    })
})

// Unlisted is not deleted. A recipe the listing stops listing is read again, which is what establishes whether it is
// still there.
describe('a dependency the listing stops listing', () => {
    it('withdraws the answer, holds the failure to read it, and recovers when it is listed again', () => {
        const session = sessionHolding([masking()], {listing: [listed(masking()), listed(bandMath(3))]})
        store(bandMath(3))
        session.watch('masking-1')
        answerLoads()
        answerBands()

        delete fake.stored['band-math-1']
        session.list([listed(masking())])
        expect(session.read('masking-1').status).toBe('NEEDS_EVIDENCE')
        answerLoads()
        session.list([listed(masking())], {withdrawn: ['band-math-1'], checkedAt: Date.now() + 1})

        expect(fake.loads).toHaveLength(2)
        expect(session.read('masking-1').status).toBe('UNAVAILABLE')

        store(bandMath(3))
        session.list([listed(masking()), listed(bandMath(3))])
        answerLoads()
        answerBands()
        expect(fake.loads).toHaveLength(3)
        expect(session.read('masking-1').status).toBe('READY')
    })

    it('is told apart from one that was never listed, which nothing reads again', () => {
        const session = sessionHolding([masking()], {listing: [listed(masking())]})
        store(bandMath(3))
        session.watch('masking-1')
        answerLoads()
        answerBands()

        session.list([listed(masking())], {checkedAt: Date.now() + 1})

        expect(fake.loads).toHaveLength(1)
        expect(session.read('masking-1').status).toBe('READY')
    })
})

// A copy the session caches for a recipe nobody has open, answered from without describing anything.
describe('a cached record the listing has moved past', () => {
    it('is read again and replaced before anything is answered from it', () => {
        const session = sessionHolding([stack(), mosaic(7)], {listing: [listed(stack()), listed(mosaic(7))]})
        session.watch('stack-1')
        expect(session.read('stack-1')).toMatchObject({status: 'READY', acquisition: null})

        store(mosaic(8))
        session.list([listed(stack()), listed(mosaic(8))])

        expect(session.read('stack-1').status).toBe('NEEDS_EVIDENCE')
        answerLoads()
        expect(session.cached('mosaic-1').revision).toBe(8)
        expect(session.read('stack-1')).toMatchObject({status: 'READY', acquisition: null})
    })

    it('holds a failure to read it, reading again only when asked to', () => {
        const session = sessionHolding([stack(), mosaic(7)], {listing: [listed(stack()), listed(mosaic(7))]})
        session.watch('stack-1')
        session.list([listed(stack()), listed(mosaic(8))])

        failLoads()
        session.list([listed(stack()), listed(mosaic(8)), listed(bandMath(1))])
        expect(session.read('stack-1').status).toBe('UNAVAILABLE')
        expect(fake.loads).toHaveLength(1)

        store(mosaic(8))
        session.runtime.retryOutput({recipeId: 'stack-1', product: {name: 'IMAGE_OUTPUT'}})
        answerLoads()
        expect(fake.loads).toHaveLength(2)
        expect(session.read('stack-1').status).toBe('READY')
    })

    // Unlisted is not gone: once read, it is known to be there, and is not read again until the listing says more.
    it('is read again when the listing stops listing it, and not again once it is known to be there', () => {
        const session = sessionHolding([stack(), mosaic(7)], {listing: [listed(stack()), listed(mosaic(7))]})
        session.watch('stack-1')
        store(mosaic(7))

        session.list([listed(stack())], {withdrawn: ['mosaic-1']})
        expect(session.read('stack-1').status).toBe('NEEDS_EVIDENCE')
        answerLoads()

        expect(session.listingState().withdrawn).toEqual([])
        expect(session.read('stack-1').status).toBe('READY')
        expect(fake.loads).toHaveLength(1)
    })

    it('is never read again while it is open, whatever storage holds', () => {
        const session = sessionHolding([stack(), mosaic(7)], {listing: [listed(stack()), listed(mosaic(7))], open: ['mosaic-1']})
        session.watch('stack-1')

        session.list([listed(stack()), listed(mosaic(8))])

        expect(fake.loads).toEqual([])
        expect(session.cached('mosaic-1').revision).toBe(7)
        expect(session.read('stack-1').status).toBe('READY')
    })
})

// Earth Engine reads a recipe's dependencies from storage, so a draft's edit reaches what it observes only once saved.
describe('an open dependency of what Earth Engine observes', () => {
    const opened = () => {
        const draft = mosaic(7)
        const root = bandMath(3, {type: 'RECIPE_REF', id: 'mosaic-1'})
        const session = sessionHolding([root, draft], {
            listing: [listed(root), listed(draft)], open: ['mosaic-1'], saves: {'mosaic-1': saved(draft)}
        })
        session.watch('band-math-1')
        answerBands()
        return {session, draft}
    }

    it('is observed again once its save is acknowledged, since that is when storage holds it', () => {
        const {session, draft} = opened()

        session.dispatch(() => ({
            recipes: [listed(bandMath(3)), {...listed(draft), revision: 8}],
            saveStates: {'mosaic-1': {...saved(draft), revision: 8}}
        }))

        expect(fake.bands).toHaveLength(2)
        expect(session.cached('mosaic-1')).toBe(draft)
    })

})

// An observation is shared by what Earth Engine evaluates, whichever output question it describes.
describe('an observation', () => {
    it('is asked once for a recipe\'s own layer, its Retrieve and a Masking over it', () => {
        const session = sessionHolding([bandMath(3), masking()], {listing: [listed(bandMath(3)), listed(masking())]})

        session.watch('band-math-1')
        session.watch('band-math-1')
        session.watch('masking-1')
        answerBands()

        expect(fake.bands).toHaveLength(1)
        expect(session.read('band-math-1').status).toBe('READY')
        expect(session.read('masking-1').status).toBe('READY')
    })

    it('is reused when Masking publishes evidence about a source that has not changed, or edits only its mask', () => {
        const session = sessionHolding([bandMath(3), masking()], {listing: [listed(bandMath(3)), listed(masking())]})
        session.watch('masking-1')
        answerBands()

        session.dispatch(process => ({loadedRecipes: {...process.loadedRecipes, 'masking-1': {
            ...masking(), ui: {sourceEvidence: {sourceKey: 'RECIPE_REF:band-math-1', observation: 1, status: 'OBSERVED'}}
        }}}))
        session.dispatch(process => ({loadedRecipes: {...process.loadedRecipes, 'masking-1': {
            ...process.loadedRecipes['masking-1'],
            model: {...masking().model, imageMask: {type: 'ASSET', id: 'users/x/other-mask'}}
        }}}))

        expect(fake.bands).toHaveLength(1)
        expect(session.read('masking-1').status).toBe('READY')
    })

    it('keeps running for one consumer when another that shares it closes', () => {
        const session = sessionHolding([bandMath(3), masking()], {listing: [listed(bandMath(3)), listed(masking())]})
        const layer = session.watch('band-math-1')
        session.watch('masking-1')

        layer.unsubscribe()
        answerBands()

        expect(fake.bands).toHaveLength(1)
        expect(session.read('masking-1').status).toBe('READY')
    })

    it.each([
        ['what is sent changes', session => session.dispatch(process => ({
            loadedRecipes: {...process.loadedRecipes, 'band-math-1': {...bandMath(3), model: {...bandMath(3).model, edited: true}}}
        }))],
        ['the credentials are replaced', session => session.replaceCredentials()]
    ])('is asked again when %s', (_case, change) => {
        const session = sessionHolding([bandMath(3), masking()], {listing: [listed(bandMath(3)), listed(masking())]})
        session.watch('masking-1')
        answerBands()

        change(session)
        answerBands()

        expect(fake.bands).toHaveLength(2)
    })

    it('is not shared between an asset and a recipe with the same id', () => {
        const overAsset = {...masking(), id: 'masking-2', model: {...masking().model, imageToMask: {type: 'ASSET', id: 'band-math-1'}}}
        const session = sessionHolding([bandMath(3), masking(), overAsset], {listing: [listed(bandMath(3))]})

        session.watch('masking-1')
        session.watch('masking-2')

        expect(fake.bands.map(({request}) => request.asset || request.recipe.id)).toEqual(['band-math-1', 'band-math-1'])
        expect(fake.bands.map(({request}) => Boolean(request.asset))).toEqual([false, true])
    })
})

// Evidence is incomplete where Earth Engine may read something other than what the session describes: a dependency
// draft storage does not hold - its references among what may differ - or one storage holds a newer revision of, or a
// dependency whose revision is not known. Such an observation is shared while in flight and never kept for reuse.
describe('an observation over incomplete evidence', () => {
    const observedTwice = ({records, listing, open = [], saves = {}}) => {
        const session = sessionHolding(records, {listing, open, saves})
        session.watch('band-math-1')
        session.watch('masking-1')
        const inFlight = fake.bands.length
        answerBands()
        session.watch('masking-2')
        answerBands()
        return {inFlight, total: fake.bands.length}
    }

    const secondMasking = {...masking(), id: 'masking-2'}

    // Saved, the dependency masks the Mosaic; its draft now masks the Stack, which is what the session describes.
    it('is shared in flight but not reused over a draft that changed its references', () => {
        const persisted = {...masking(), id: 'masked-dep', model: {...masking().model, imageToMask: {type: 'RECIPE_REF', id: 'mosaic-1'}}}
        const draft = {...persisted, model: {...persisted.model, imageToMask: {type: 'RECIPE_REF', id: 'stack-1'}}}
        const root = bandMath(3, {type: 'RECIPE_REF', id: 'masked-dep'})
        const {inFlight, total} = observedTwice({
            records: [root, draft, mosaic(7), stack(), masking(), secondMasking],
            listing: [listed(root), listed(persisted), listed(mosaic(7)), listed(stack())],
            open: ['masked-dep'],
            saves: {'masked-dep': {...saved(persisted), status: 'SAVING', since: 0}}
        })

        expect(inFlight).toBe(1)
        expect(total).toBe(2)
    })

    it('is shared in flight but not reused over a draft storage holds a newer revision of', () => {
        const draft = mosaic(7)
        const root = bandMath(3, {type: 'RECIPE_REF', id: 'mosaic-1'})
        const {inFlight, total} = observedTwice({
            records: [root, draft, masking(), secondMasking],
            listing: [listed(root), {...listed(draft), revision: 8}],
            open: ['mosaic-1'],
            saves: {'mosaic-1': saved(draft)}
        })

        expect(inFlight).toBe(1)
        expect(total).toBe(2)
    })

    it('is not reused over a dependency whose revision is not known', () => {
        const unrevised = {...mosaic(7), revision: undefined}
        const root = bandMath(3, {type: 'RECIPE_REF', id: 'mosaic-1'})
        const {total} = observedTwice({records: [root, unrevised, masking(), secondMasking], listing: [listed(root)]})

        expect(total).toBe(2)
    })

    it('is reused once the draft is what storage holds', () => {
        const draft = mosaic(7)
        const root = bandMath(3, {type: 'RECIPE_REF', id: 'mosaic-1'})
        const {total} = observedTwice({
            records: [root, draft, masking(), secondMasking],
            listing: [listed(root), listed(draft)],
            open: ['mosaic-1'],
            saves: {'mosaic-1': saved(draft)}
        })

        expect(total).toBe(1)
    })
})

// Apply decides from the read it takes at that moment, before anything has reacted to the dispatch before it.
describe('a Retrieve applied', () => {
    it('cannot submit what a newer revision, known in the dispatch just before, has superseded', () => {
        const session = sessionHolding([masking()], {listing: [listed(masking()), listed(bandMath(3))]})
        store(bandMath(3))
        session.watch('masking-1')
        answerLoads()
        answerBands()
        expect(session.decide('masking-1', ['scaled3']).status).toBe('RETRIEVABLE')

        session.list([listed(masking()), listed(bandMath(4))])

        expect(session.decide('masking-1', ['scaled3']).status).not.toBe('RETRIEVABLE')
    })

    // The store copies what it publishes, so the acknowledged model is never the draft's own object.
    it('proceeds when the store published a copy of the acknowledged draft', () => {
        const draft = bandMath(3)
        const session = sessionHolding([masking(), draft], {listing: [listed(masking()), listed(draft)], open: [draft.id]})
        session.dispatch(process => published(process, actionBuilder('EDIT').set(['process.loadedRecipes', draft.id, 'model'], draft.model)))
        session.watch('masking-1')
        answerBands()

        session.dispatch(process => published(process, actionBuilder('SET_SAVE_STATE')
            .set(['process.saveStates', draft.id], saved(process.loadedRecipes[draft.id]))))

        expect(session.decide('masking-1', ['scaled3']).status).toBe('RETRIEVABLE')
    })

    it.each([
        ['waits while a dependency\'s save is outstanding', {status: 'SAVING', unconfirmed: false}, 'RESOLVING', null],
        ['blocks once that save is unconfirmed past its bound', {status: 'SAVING', unconfirmed: true}, 'BLOCKED', 'SAVE_UNCONFIRMED'],
        ['blocks a dependency whose save was refused', {status: 'FAILED', model: {}}, 'BLOCKED', 'SAVE_FAILED'],
        ['blocks a confirmed conflict', {status: 'CONFLICT'}, 'BLOCKED', 'SAVE_CONFLICT'],
        ['blocks a save that could not be resolved, as that', {status: 'UNRESOLVED'}, 'BLOCKED', 'SAVE_UNRESOLVED']
    ])('%s', (_case, saveState, status, code) => {
        const draft = bandMath(3)
        const session = sessionHolding([masking(), draft], {
            listing: [listed(masking()), listed(draft)], open: ['band-math-1'], saves: {'band-math-1': saved(draft)}
        })
        session.watch('masking-1')
        answerBands()

        session.dispatch(() => ({saveStates: {'band-math-1': {...saved(draft), ...saveState}}}))

        expect(session.decide('masking-1', ['scaled3']).status).toBe(status)
        expect(session.retrieveRead('masking-1').output.diagnostics.map(({code}) => code)).toEqual(code ? [code] : ['SAVE_PENDING'])
    })

    it('proceeds once the draft is what storage holds, and blocks when storage holds a newer revision', () => {
        const draft = bandMath(3)
        const session = sessionHolding([masking(), draft], {
            listing: [listed(masking()), listed(draft)], open: ['band-math-1'], saves: {'band-math-1': saved(draft)}
        })
        session.watch('masking-1')
        answerBands()
        expect(session.decide('masking-1', ['scaled3']).status).toBe('RETRIEVABLE')

        session.dispatch(() => ({recipes: [listed(masking()), {...listed(draft), revision: 5}]}))
        answerBands()

        expect(session.retrieveRead('masking-1').output.diagnostics).toEqual([{code: 'REMOTE_NEWER', recipeId: 'band-math-1'}])
    })

    it.each([
        ['expired', {checkedAt: Date.now() - 301000}, 'REVISIONS_EXPIRED'],
        ['unavailable after a failed refresh', {checkedAt: Date.now() - 301000, failure: {message: 'x'}}, 'REVISIONS_UNAVAILABLE']
    ])('blocks while the listing is %s, rather than resolving', (_case, recipeListing, code) => {
        const session = sessionHolding([bandMath(3)], {listing: [listed(bandMath(3))]})
        session.watch('band-math-1')
        answerBands()

        session.dispatch(() => ({recipeListing}))

        expect(session.decide('band-math-1', ['scaled3']).status).toBe('BLOCKED')
        expect(session.retrieveRead('band-math-1').output.diagnostics).toEqual([{code}])
    })
})

// A save acknowledged or a tab closed says nothing an observation made before it can rely on.
describe('a dependency edited while its answer is held', () => {
    const editing = () => {
        const draft = mosaic(7)
        const root = bandMath(3, {type: 'RECIPE_REF', id: draft.id})
        const session = sessionHolding([root, draft], {
            listing: [listed(root), listed(draft)], open: [draft.id], saves: {[draft.id]: saved(draft)}
        })
        session.watch(root.id)
        answerBands()
        const edited = {...draft, model: {...draft.model, compositeOptions: {...draft.model.compositeOptions, compose: 'MEDOID'}}}
        session.dispatch(process => ({
            loadedRecipes: {...process.loadedRecipes, [draft.id]: edited},
            saveStates: {[draft.id]: {...saved(draft), status: 'SAVING'}}
        }))
        answerBands()
        return {session, draft, edited, root}
    }

    it('is withdrawn by the acknowledgement itself, before the listing hears of it, until observed again', () => {
        const {session, draft, edited, root} = editing()

        session.dispatch(() => ({saveStates: {[draft.id]: {...saved(edited), revision: 8}}}))

        expect(session.decide(root.id, ['scaled3']).status).toBe('RESOLVING')
        answerBands()
        expect(session.decide(root.id, ['scaled3']).status).toBe('RETRIEVABLE')
    })

    it('stays a draft when its tab closes while it is saving, until the save is acknowledged', () => {
        const {session, draft, edited, root} = editing()

        session.dispatch(() => ({tabs: []}))
        expect(session.decide(root.id, ['scaled3']).status).toBe('RESOLVING')

        session.dispatch(process => ({
            recipes: [listed(root), {...listed(draft), revision: 8}],
            saveStates: {[draft.id]: {...saved(edited), revision: 8}},
            loadedRecipes: {...process.loadedRecipes, [draft.id]: {...edited, revision: 8}}
        }))
        answerBands()
        expect(session.decide(root.id, ['scaled3']).status).toBe('RETRIEVABLE')
    })

    it('is not read again from storage while its closed draft is still saving', () => {
        const {session, draft} = editing()
        session.dispatch(() => ({tabs: []}))

        session.list([listed(bandMath(3)), {...listed(draft), revision: 8}])

        expect(fake.loads).toEqual([])
    })
})

describe('a listing that failed', () => {
    it('is refreshed by an explicit retry', () => {
        const root = bandMath(3)
        const session = sessionHolding([root], {listing: [listed(root)]})
        session.watch(root.id)
        answerBands()
        session.dispatch(() => ({recipeListing: {checkedAt: Date.now() - 301000, failure: {message: 'offline'}}}))

        session.runtime.retryOutput({recipeId: root.id, product: {name: 'IMAGE_OUTPUT'}})

        expect(fake.listings).toHaveLength(1)
    })
})

// A session: a store holding these records, listing and saves, and a runtime over it, as the provider creates it.
const sessionHolding = (records, {listing = [], open = [], saves = {}} = {}) => {
    const store = createStore((state, action) => 'reduce' in action ? action.reduce(state) : state, {
        user: {currentUser: {googleTokens: {}}},
        process: {
            loadedRecipes: Object.fromEntries(records.map(record => [record.id, record])),
            recipes: listing,
            recipeListing: {checkedAt: Date.now()},
            tabs: open.map(id => ({id})),
            saveStates: saves
        }
    })
    const environment = createReduxSourceEnvironment({store})
    const runtime = createSourceRuntime({
        environment$: environment.environment$,
        session: environment.session,
        sessionChanges$: environment.sessionChanges$,
        updateRecipeListing: environment.updateRecipeListing,
        replaceCachedRecipe: environment.replaceCachedRecipe
    })
    const dispatch = change => store.dispatch({
        type: 'CHANGE',
        reduce: state => ({...state, process: {...state.process, ...change(state.process)}})
    })
    const heldFor = key => runtime.heldFor(key)
    const retrieveRead = recipeId => readRetrieveOutput({state: store.getState(), recipeId, heldFor})
    return {
        runtime,
        dispatch,
        watch: recipeId => runtime.watchOutput$({recipeId, product: {name: 'IMAGE_OUTPUT'}}).subscribe(),
        // A successful listing, as a refresh merges it: evidence as of now.
        list: (recipes, listingState = {}) => dispatch(process => ({
            recipes,
            recipeListing: {...process.recipeListing, checkedAt: Date.now(), withdrawn: [], ...listingState}
        })),
        cached: id => store.getState().process.loadedRecipes[id],
        replaceCredentials: () => store.dispatch({
            type: 'CREDENTIALS',
            reduce: state => ({...state, user: {currentUser: {googleTokens: {}}}})
        }),
        listingState: () => store.getState().process.recipeListing,
        // What a map layer renders from.
        read: recipeId => {
            const state = store.getState()
            const loadedRecipes = state.process.loadedRecipes
            const recipe = loadedRecipes[recipeId]
            return readRecipeOutput({
                recipe,
                product: {name: 'IMAGE_OUTPUT'},
                graph: buildMapDependencyGraph({recipe, loadedRecipes}),
                heldFor,
                currency: recordStalenessOfState(state)
            })
        },
        retrieveRead,
        decide: (recipeId, names) => {
            const {output, pending} = retrieveRead(recipeId)
            return retrieveDecision({output, pending, names, destination: 'GEE'})
        }
    }
}

const store = record => fake.stored[record.id] = record

// Answers every load still waiting with what storage holds now, or as not found.
const answerLoads = () => waiting(fake.loads).forEach(load => {
    load.answered = true
    if (fake.stored[load.id]) {
        load.subscriber.next(fake.stored[load.id])
        load.subscriber.complete()
    } else {
        load.subscriber.error(Object.assign(new Error('Not found'), {status: 404}))
    }
})

const failLoads = () => waiting(fake.loads).forEach(load => {
    load.answered = true
    load.subscriber.error(new Error('unreachable'))
})

// Answers every description still waiting, or the one given, with the bands the recipe it was sent names.
const answerBands = only => (only ? [only] : waiting(fake.bands)).forEach(request => {
    request.answered = true
    if (!request.subscriber.closed) {
        request.subscriber.next(outputNames(request.request.recipe).map(name => ({name, arrayDimensions: 0})))
        request.subscriber.complete()
    }
})

const waiting = requests => requests.filter(({answered}) => !answered)

const outputNames = recipe => recipe.model.outputBands.outputImages
    .flatMap(({outputBands}) => outputBands.map(({outputName, defaultOutputName}) => outputName || defaultOutputName))

const bandNames = read => read.bands.map(({name}) => name)

const listed = ({id, type, revision}) => ({id, name: id, type, revision})

// What the store holds once it has applied the action.
const published = (process, action) => action.build().reduce({process}).process

const saved = draft => ({status: 'SAVED', model: draft.model, revision: draft.revision, since: null, unconfirmed: false})

const bandMath = (revision, input = {type: 'ASSET', id: 'users/x/dem'}) => ({
    id: 'band-math-1',
    type: 'BAND_MATH',
    revision,
    model: {
        inputImagery: {images: [{imageId: 'i-1', name: 'i1', ...input, includedBands: [{id: 'b1', name: 'elevation'}]}]},
        calculations: {calculations: [
            {imageId: 'c-1', name: 'c1', type: 'EXPRESSION', expression: `i1.elevation * ${revision}`, dataType: 'int16'}
        ]},
        outputBands: {outputImages: [
            {imageId: 'c-1', outputBands: [{id: 'd', name: 'scaled', defaultOutputName: `scaled${revision}`}]}
        ]}
    }
})

const masking = () => ({
    id: 'masking-1',
    type: 'MASKING',
    revision: 2,
    model: {imageToMask: {type: 'RECIPE_REF', id: 'band-math-1'}, imageMask: {type: 'ASSET', id: 'users/x/mask'}}
})

const mosaic = (revision = 7) => ({
    id: 'mosaic-1',
    type: 'MOSAIC',
    revision,
    model: {
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 100},
        compositeOptions: {corrections: ['SR'], compose: revision > 7 ? 'MEDOID' : 'MEDIAN'}
    }
})

const stack = () => ({
    id: 'stack-1',
    type: 'STACK',
    revision: 1,
    model: {
        inputImagery: {images: [{imageId: 'i-1', type: 'RECIPE_REF', id: 'mosaic-1'}]},
        bandNames: {bandNames: [{imageId: 'i-1', bands: [{id: 'x', originalName: 'blue', outputName: 'b'}]}]}
    }
})
