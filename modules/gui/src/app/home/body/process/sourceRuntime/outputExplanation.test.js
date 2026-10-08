import {legacy_createStore as createStore} from 'redux'
import {Observable, of} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

// What an editor's question adds to a recipe refused for its own configuration: the refusal at once, as every consumer
// has it, and what reading the inputs it names establishes, once read. A real store, the real Redux adapter, runtime
// and common read; Earth Engine and storage are fakes answering only when a test says so.

const fake = vi.hoisted(() => ({bands: [], versionReads: [], recipeLoads: []}))
vi.mock('~/apiRegistry', () => ({default: {
    recipe: {
        load$: id => new Observable(subscriber => {
            fake.recipeLoads.push({id, subscriber})
        }),
        loadAll$: () => new Observable(() => {})
    },
    gee: {
        bands$: request => new Observable(subscriber => {
            const entry = {request, subscriber}
            fake.bands.push(entry)
            return () => entry.cancelled = !entry.answered
        }),
        assetVersions$: ({ids}) => new Observable(subscriber => {
            fake.versionReads.push({ids, subscriber})
        })
    }
}}))
vi.mock('~/translate', () => ({msg: key => key}))

const {buildMapDependencyGraph} = await import('../recipe/mapDependencyGraph')
const {readRecipeOutput} = await import('../recipe/recipeOutput')
const {assetEvidenceOfState} = await import('./assetEvidence')
const {createReduxSourceEnvironment} = await import('./reduxSourceEnvironment')
const {recordStalenessOfState} = await import('./recordCurrency')
const {createSourceRuntime} = await import('./sourceRuntime')
const {initStore} = await import('~/store')

beforeEach(() => {
    fake.bands = []
    fake.versionReads = []
    fake.recipeLoads = []
})

describe('an editor reading a recipe refused for its own configuration', () => {
    it('has the refusal at once, before anything is read', () => {
        const session = sessionHolding([duplicated(asset(DEM))])

        session.watchEditor()

        expect(session.read({explain: true})).toMatchObject({status: 'INVALID'})
        expect(codes(session.read({explain: true}))).toEqual(['DUPLICATE_BAND_NAME'])
        expect(imageObservations()).toEqual([])
    })

    it('has what reading its inputs establishes beside the refusal once they are read, the refusal unchanged', () => {
        const session = sessionHolding([duplicated(asset(DEM))])
        session.watchEditor()

        answerAsset(DEM, SLOPE_ONLY)

        expect(session.read({explain: true}).status).toBe('INVALID')
        expect(codes(session.read({explain: true}))).toEqual(['DUPLICATE_BAND_NAME', 'MISSING_INPUT_BAND'])
        expect(imageObservations()).toEqual([])
    })

    it('keeps what one input establishes when another cannot be read', () => {
        const session = sessionHolding([duplicated(asset(DEM), asset(WATER))])
        session.watchEditor()

        answerAsset(DEM, SLOPE_ONLY)
        failAsset(WATER, new Error('unreadable'))

        expect(codes(session.read({explain: true}))).toEqual(['DUPLICATE_BAND_NAME', 'MISSING_INPUT_BAND'])
    })

    it('has nothing more, and no other status, when its inputs cannot be read', () => {
        const session = sessionHolding([duplicated(asset(DEM))])
        session.watchEditor()

        failAsset(DEM, new Error('unreadable'))

        expect(session.read({explain: true}).status).toBe('INVALID')
        expect(codes(session.read({explain: true}))).toEqual(['DUPLICATE_BAND_NAME'])
    })

    it('reads its inputs again on a retry when none could be read', () => {
        const session = sessionHolding([duplicated(asset(DEM))])
        session.watchEditor()
        failAsset(DEM, new Error('unreadable'))

        session.runtime.retryOutput(EDITOR)
        answerAsset(DEM, SLOPE_ONLY)

        expect(fake.bands).toHaveLength(2)
        expect(codes(session.read({explain: true}))).toEqual(['DUPLICATE_BAND_NAME', 'MISSING_INPUT_BAND'])
    })

    it('checks again every asset its failures name when none could be read', () => {
        const session = sessionHolding([duplicated(asset(DEM), asset(WATER))])
        session.watchEditor()
        answerVersions({})

        failAsset(DEM, eeFailure(`Image.load: Image asset '${DEM}' not found`))
        failAsset(WATER, eeFailure(`Image.load: Image asset '${WATER}' not found`))

        expect(versionReads().slice(1).flat().sort()).toEqual([DEM, WATER])
    })

    it('outputting no bands has its inputs read all the same', () => {
        const session = sessionHolding([withOutputs(bandMath(asset(DEM)), [])])
        session.watchEditor()

        answerAsset(DEM, SLOPE_ONLY)

        expect(codes(session.read({explain: true}))).toEqual(['NO_OUTPUT_BANDS', 'MISSING_INPUT_BAND'])
    })

    // A cold editor: the session does not hold the recipe its input selects.
    it('loads the records its inputs read before reading them, then has what they establish', () => {
        const session = sessionHolding([duplicated(recipeInput(MASKING.id))])
        session.watchEditor()
        expect(fake.recipeLoads.map(({id}) => id)).toEqual([MASKING.id])

        answerRecipe(MASKING)
        answerAsset(DEM, SLOPE_ONLY)

        expect(codes(session.read({explain: true}))).toEqual(['DUPLICATE_BAND_NAME', 'MISSING_INPUT_BAND'])
        expect(versionReads().flat()).toContain(DEM)
    })

    it('has the refusal alone when a record it needs cannot be loaded, and loads it again on a retry', () => {
        const session = sessionHolding([duplicated(recipeInput(MASKING.id))])
        session.watchEditor()
        failRecipe(MASKING.id)
        expect(codes(session.read({explain: true}))).toEqual(['DUPLICATE_BAND_NAME'])

        session.runtime.retryOutput(EDITOR)
        answerRecipe(MASKING)
        answerAsset(DEM, SLOPE_ONLY)

        expect(codes(session.read({explain: true}))).toEqual(['DUPLICATE_BAND_NAME', 'MISSING_INPUT_BAND'])
    })
})

describe('a map layer watching the same refused recipe', () => {
    it('reads nothing to explain it, whether or not an editor does', () => {
        const session = sessionHolding([duplicated(asset(DEM))])
        session.watchLayer()
        expect(fake.bands).toEqual([])

        session.watchEditor()
        answerAsset(DEM, SLOPE_ONLY)

        expect(fake.bands).toHaveLength(1)
        expect(codes(session.read())).toEqual(['DUPLICATE_BAND_NAME'])
        expect(codes(session.read({explain: true}))).toEqual(['DUPLICATE_BAND_NAME', 'MISSING_INPUT_BAND'])
    })

    it('keeps its answer when the last editor closes, cancelling what was still being read', () => {
        const session = sessionHolding([duplicated(asset(DEM))])
        session.watchLayer()
        const editor = session.watchEditor()

        editor.unsubscribe()

        expect(fake.bands.map(({cancelled}) => cancelled)).toEqual([true])
        expect(codes(session.read())).toEqual(['DUPLICATE_BAND_NAME'])
    })
})

describe('an explanation once the editor is closed', () => {
    it('still being read is cancelled, and read anew when an editor opens again', () => {
        const session = sessionHolding([duplicated(asset(DEM))])
        const editor = session.watchEditor()

        editor.unsubscribe()
        expect(fake.bands.map(({cancelled}) => cancelled)).toEqual([true])
        session.watchEditor()

        expect(fake.bands).toHaveLength(2)
        expect(codes(session.read({explain: true}))).toEqual(['DUPLICATE_BAND_NAME'])
    })

    it('none of whose inputs could be read is read anew when an editor opens again', () => {
        const session = sessionHolding([duplicated(asset(DEM))])
        const editor = session.watchEditor()
        failAsset(DEM, new Error('unreadable'))

        editor.unsubscribe()
        session.advance(1000)
        session.watchEditor()
        answerAsset(DEM, SLOPE_ONLY)

        expect(fake.bands).toHaveLength(2)
        expect(codes(session.read({explain: true}))).toEqual(['DUPLICATE_BAND_NAME', 'MISSING_INPUT_BAND'])
    })

    it('read finding nothing more is held as complete, and reused when an editor opens again', () => {
        const session = sessionHolding([duplicated(asset(DEM))])
        const editor = session.watchEditor()
        answerAsset(DEM, ELEVATION)

        editor.unsubscribe()
        session.advance(1000)
        session.watchEditor()

        const {acquisition, ...output} = session.read({explain: true})
        expect(session.runtime.heldFor(acquisition.key).status).toBe('COMPLETE')
        expect(codes(output)).toEqual(['DUPLICATE_BAND_NAME'])
        expect(fake.bands).toHaveLength(1)
    })

    it('read where only some inputs could be read is reused when an editor opens again', () => {
        const session = sessionHolding([duplicated(asset(DEM), asset(WATER))])
        const editor = session.watchEditor()
        answerAsset(DEM, SLOPE_ONLY)
        failAsset(WATER, new Error('unreadable'))

        editor.unsubscribe()
        session.advance(1000)
        session.watchEditor()

        expect(fake.bands).toHaveLength(2)
        expect(codes(session.read({explain: true}))).toEqual(['DUPLICATE_BAND_NAME', 'MISSING_INPUT_BAND'])
    })

    it('read is reused when an editor opens again while it is current, reading nothing again', () => {
        const session = sessionHolding([duplicated(asset(DEM))])
        const editor = session.watchEditor()
        answerAsset(DEM, SLOPE_ONLY)

        editor.unsubscribe()
        session.advance(30000)
        session.watchEditor()

        expect(fake.bands).toHaveLength(1)
        expect(codes(session.read({explain: true}))).toEqual(['DUPLICATE_BAND_NAME', 'MISSING_INPUT_BAND'])
    })
})

describe('an explanation read', () => {
    it('is withdrawn when an asset it read is found at another token, and read again', () => {
        const session = sessionHolding([duplicated(asset(DEM))])
        session.watchEditor()
        answerVersions({[DEM]: 'v1'})
        answerAsset(DEM, SLOPE_ONLY)

        session.advance(270000)
        answerVersions({[DEM]: 'v2'})

        expect(codes(session.read({explain: true}))).toEqual(['DUPLICATE_BAND_NAME'])
        answerAsset(DEM, ELEVATION)
        expect(codes(session.read({explain: true}))).toEqual(['DUPLICATE_BAND_NAME'])
        expect(fake.bands).toHaveLength(2)
    })

    it('is withdrawn when the credentials change, and read again under the new ones', () => {
        const session = sessionHolding([duplicated(asset(DEM))])
        session.watchEditor()
        answerAsset(DEM, SLOPE_ONLY)

        session.replaceCredentials()

        expect(codes(session.read({explain: true}))).toEqual(['DUPLICATE_BAND_NAME'])
        expect(fake.bands).toHaveLength(2)
    })

    it('is read again on an explicit refresh of the editor\'s question', async () => {
        const session = sessionHolding([duplicated(asset(DEM))])
        session.watchEditor()
        answerVersions({[DEM]: 'v1'})
        answerAsset(DEM, SLOPE_ONLY)

        const refreshed = session.runtime.refreshOutput(EDITOR)
        answerVersions({[DEM]: 'v1'})
        await refreshed

        expect(codes(session.read({explain: true}))).toEqual(['DUPLICATE_BAND_NAME'])
        answerAsset(DEM, ELEVATION)
        expect(codes(session.read({explain: true}))).toEqual(['DUPLICATE_BAND_NAME'])
        expect(fake.bands).toHaveLength(2)
    })
})

const DEM = 'users/x/dem'
const WATER = 'users/x/water'
const ELEVATION = [{name: 'elevation', arrayDimensions: 0}]
const SLOPE_ONLY = [{name: 'slope', arrayDimensions: 0}]
const LAYER = Object.freeze({recipeId: 'band-math-1', product: {name: 'IMAGE_OUTPUT'}})
const EDITOR = Object.freeze({...LAYER, explain: true})

const asset = id => ({type: 'ASSET', id})
const recipeInput = id => ({type: 'RECIPE_REF', id})

// A Band Math including the band `elevation` of each source, and outputting the first.
const bandMath = (...sources) => ({
    id: 'band-math-1',
    type: 'BAND_MATH',
    revision: 1,
    ui: {initialized: true},
    model: {
        inputImagery: {images: sources.map(({type, id}, index) => ({
            imageId: `i-${index}`, name: `i${index}`, type, id, includedBands: [{id: `b-${index}`, name: 'elevation'}]
        }))},
        calculations: {calculations: []},
        outputBands: {outputImages: [{imageId: 'i-0', outputBands: [{id: 'b-0', name: 'elevation', defaultOutputName: 'elevation'}]}]}
    }
})

const withOutputs = (recipe, outputImages) => ({...recipe, model: {...recipe.model, outputBands: {outputImages}}})

// The same Band Math outputting its first band twice under one name.
const duplicated = (...sources) => withOutputs(bandMath(...sources), [{imageId: 'i-0', outputBands: [
    {id: 'b-0', name: 'elevation', defaultOutputName: 'x'},
    {id: 'b-0-copy', name: 'elevation', defaultOutputName: 'x'}
]}])

const MASKING = {
    id: 'masking-1',
    type: 'MASKING',
    revision: 1,
    model: {imageToMask: asset(DEM), imageMask: asset('users/x/mask')}
}

// A real store holding these records, the runtime over it, and a clock the test moves.
const sessionHolding = records => {
    let now = 0
    let timers = []
    const store = createStore((state, action) => 'reduce' in action ? action.reduce(state) : state, {
        user: {currentUser: {googleTokens: {}}},
        process: {
            loadedRecipes: Object.fromEntries(records.map(record => [record.id, record])),
            recipes: [...records, MASKING].map(({id, type}) => ({id, type, revision: 1})),
            recipeListing: {checkedAt: 0},
            tabs: [],
            saveStates: {}
        }
    })
    initStore(store)
    const environment = createReduxSourceEnvironment({store})
    const runtime = createSourceRuntime({
        environment$: environment.environment$,
        session: environment.session,
        sessionChanges$: environment.sessionChanges$,
        updateRecipeListing: environment.updateRecipeListing,
        replaceCachedRecipe: environment.replaceCachedRecipe,
        updateAssetEvidence: environment.updateAssetEvidence,
        refreshSources: environment.refreshSources,
        loadRecipeListing$: () => of([...records, MASKING].map(({id, type}) => ({id, type, revision: 1}))),
        visible: () => true,
        clock: {
            now: () => now,
            setTimeout: (callback, ms) => {
                const timer = {at: now + ms, callback}
                timers.push(timer)
                return timer
            },
            clearTimeout: timer => timers = timers.filter(other => other !== timer)
        }
    })
    return {
        runtime,
        // What the consumer asking renders from: an editor explaining, or a map layer.
        read: ({explain = false} = {}) => {
            const state = store.getState()
            const loadedRecipes = state.process.loadedRecipes
            const recipe = loadedRecipes['band-math-1']
            return readRecipeOutput({
                recipe,
                product: {name: 'IMAGE_OUTPUT'},
                graph: buildMapDependencyGraph({recipe, loadedRecipes}),
                heldFor: key => runtime.heldFor(key),
                currency: recordStalenessOfState(state),
                assetEvidence: assetEvidenceOfState(state),
                explain
            })
        },
        watchEditor: () => runtime.watchOutput$(EDITOR).subscribe(),
        watchLayer: () => runtime.watchOutput$(LAYER).subscribe(),
        replaceCredentials: () => store.dispatch({
            type: 'CREDENTIALS',
            reduce: state => ({...state, user: {currentUser: {googleTokens: {}}}})
        }),
        advance: ms => {
            const until = now + ms
            for (;;) {
                const due = timers.filter(({at}) => at <= until).sort((a, b) => a.at - b.at)[0]
                if (!due) {
                    break
                }
                timers = timers.filter(timer => timer !== due)
                now = due.at
                due.callback()
            }
            now = until
        }
    }
}

const codes = ({diagnostics}) => diagnostics
    .filter(({code}) => code !== 'UNAVAILABLE_DESCRIPTION' && code !== 'MISSING_SOURCE')
    .map(({code}) => code)

const versionReads = () => fake.versionReads.map(({ids}) => ids)

const answerVersions = versions => fake.versionReads.filter(read => !read.answered).forEach(read => {
    read.answered = true
    read.subscriber.next({assets: read.ids.map(id => ({id, type: 'IMAGE', version: versions[id] ?? 'v1'}))})
    read.subscriber.complete()
})

const imageObservations = () => fake.bands.filter(({request}) => request.recipe)

const unansweredFor = assetId => fake.bands.filter(entry => !entry.answered && !entry.cancelled && entry.request.asset === assetId)

const answerAsset = (assetId, bands) => unansweredFor(assetId).forEach(entry => {
    entry.answered = true
    entry.subscriber.next(bands)
    entry.subscriber.complete()
})

const eeFailure = earthEngineMessage =>
    Object.assign(new Error('ajax error 500'), {status: 500, response: {messageArgs: {earthEngineMessage}}})

const failAsset = (assetId, error) => unansweredFor(assetId).forEach(entry => {
    entry.answered = true
    entry.subscriber.error(error)
})

const answerRecipe = record => fake.recipeLoads.filter(load => !load.answered && load.id === record.id).forEach(load => {
    load.answered = true
    load.subscriber.next(record)
    load.subscriber.complete()
})

const failRecipe = id => fake.recipeLoads.filter(load => !load.answered && load.id === id).forEach(load => {
    load.answered = true
    load.subscriber.error(Object.assign(new Error('Not found'), {status: 404}))
})
