import {legacy_createStore as createStore} from 'redux'
import {Observable, of} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

// Whether what is drawn and authorized is still about the assets it reads. A real store, the real Redux adapter,
// runtime, common read and Retrieve read; Earth Engine is a counting fake whose version reads answer only when a test
// says so. Each change reaches the runtime the way it reaches it in the application: as a dispatch.

const fake = vi.hoisted(() => ({bands: [], versionReads: []}))

vi.mock('~/apiRegistry', () => ({default: {
    recipe: {
        load$: () => new Observable(() => {}),
        loadAll$: () => new Observable(() => {})
    },
    gee: {
        bands$: request => new Observable(subscriber => {
            fake.bands.push({request, subscriber})
        }),
        assetVersions$: ({ids}) => new Observable(subscriber => {
            fake.versionReads.push({ids, subscriber})
        })
    }
}}))

vi.mock('~/translate', () => ({msg: key => key}))

const {buildMapDependencyGraph} = await import('../recipe/mapDependencyGraph')
const {readRecipeOutput} = await import('../recipe/recipeOutput')
const {readRetrieveOutput, retrieveDecision} = await import('../recipe/retrieveOutput')
const {assetEvidenceOfState} = await import('./assetEvidence')
const {createReduxSourceEnvironment} = await import('./reduxSourceEnvironment')
const {recordStalenessOfState} = await import('./recordCurrency')
const {createSourceRuntime} = await import('./sourceRuntime')
const {initStore} = await import('~/store')
const {assetsMutated} = await import('~/widget/assetMutations')

beforeEach(() => {
    fake.bands = []
    fake.versionReads = []
})

describe('the assets an output reads', () => {
    it('are read when it is watched, though it is described from its configuration alone', () => {
        const session = sessionHolding([remapping('users/x/landcover')])

        session.watch('remapping-1')

        expect(fake.bands).toHaveLength(0)
        expect(versionReads()).toEqual([['users/x/landcover']])
    })

    it('are read once for a map layer and a Retrieve watching the same output', () => {
        const session = sessionHolding([remapping('users/x/landcover')])

        session.watch('remapping-1')
        session.watch('remapping-1')

        expect(versionReads()).toEqual([['users/x/landcover']])
    })

    it('are read once for two outputs reading the same asset', () => {
        const session = sessionHolding([remapping('users/x/landcover'), remapping('users/x/landcover', 'remapping-2')])

        session.watch('remapping-1')
        session.watch('remapping-2')

        expect(versionReads()).toEqual([['users/x/landcover']])
    })

    it('change with the configuration: an asset no longer read is let go, and one read anew is read', () => {
        const session = sessionHolding([remapping('users/x/landcover')])
        session.watch('remapping-1')
        answerVersions({'users/x/landcover': 'v1'})

        session.edit(remapping('users/x/forest'))

        expect(versionReads()).toEqual([['users/x/landcover'], ['users/x/forest']])
        answerVersions({'users/x/forest': 'v1'})
        session.advance(270000)
        expect(versionReads().slice(2)).toEqual([['users/x/forest']])
    })

    it('are no longer read once nothing watches them', () => {
        const session = sessionHolding([remapping('users/x/landcover')])
        const watch = session.watch('remapping-1')
        answerVersions({'users/x/landcover': 'v1'})

        watch.unsubscribe()
        session.advance(600000)

        expect(versionReads()).toEqual([['users/x/landcover']])
    })
})

describe('a description read from an asset', () => {
    it('is withdrawn in the dispatch that reports a new token, and described again without reusing what was observed', () => {
        const session = describedBandMath()

        session.advance(270000)
        answerVersions({'users/x/dem': 'v2'})

        expect(session.read('band-math-1').status).toBe('NEEDS_EVIDENCE')
        expect(imageObservations()).toHaveLength(2)
    })

    it('read once its token was known is withdrawn in the dispatch that reports another', () => {
        const session = sessionHolding([bandMath('users/x/dem')])
        session.runtime.claimAssets(['users/x/dem'])
        answerVersions({'users/x/dem': 'v1'})
        session.watch('band-math-1')
        answerBands()

        session.advance(270000)
        answerVersions({'users/x/dem': 'v2'})

        expect(session.read('band-math-1').status).toBe('NEEDS_EVIDENCE')
        expect(imageObservations()).toHaveLength(2)
    })

    it('is kept, however long, while its token is unchanged', () => {
        const session = describedBandMath()

        for (let poll = 0; poll < 10; poll++) {
            session.advance(270000)
            answerVersions({'users/x/dem': 'v1'})
        }

        expect(session.read('band-math-1').status).toBe('READY')
        expect(imageObservations()).toHaveLength(1)
    })

    it('is not withdrawn when an asset it does not read changes', () => {
        const session = describedBandMath([remapping('users/x/landcover')])
        session.watch('remapping-1')
        answerVersions({'users/x/landcover': 'v1'})

        session.advance(270000)
        answerVersions({'users/x/dem': 'v1', 'users/x/landcover': 'v2'})

        expect(session.read('band-math-1').status).toBe('READY')
        expect(imageObservations()).toHaveLength(1)
    })

    it('from a source without a token is kept however old, and authorizes Retrieve for half an hour, until refreshed', async () => {
        const session = describedBandMath([], 'gs://bucket/dem.tif', {'gs://bucket/dem.tif': UNVERSIONED})

        session.advance(1799999)
        expect(session.decide('band-math-1')).toBe('RETRIEVABLE')
        session.advance(1)

        expect(session.read('band-math-1').status).toBe('READY')
        expect(imageObservations()).toHaveLength(1)
        expect(session.decide('band-math-1')).toBe('BLOCKED')
        expect(session.retrieveRead('band-math-1').output.diagnostics).toEqual([{code: 'ASSETS_EXPIRED', assetId: 'gs://bucket/dem.tif'}])
        const refreshed = session.runtime.refreshOutput(QUESTION)
        answerVersions({'gs://bucket/dem.tif': UNVERSIONED})
        await refreshed
        answerBands()
        expect(session.decide('band-math-1')).toBe('RETRIEVABLE')
    })
})

describe('a Retrieve over an output described from an asset', () => {
    it('cannot submit in the dispatch that reports a new token', () => {
        const session = describedBandMath()
        expect(session.decide('band-math-1')).toBe('RETRIEVABLE')

        session.advance(270000)
        answerVersions({'users/x/dem': 'v2'})

        expect(session.decide('band-math-1')).not.toBe('RETRIEVABLE')
    })

    it('offers the bands a collection now holds once a member replaced under it changes its token', () => {
        const session = sessionHolding([maskingOver('users/x/collection')])
        session.watch('masking-1')
        answerVersions({'users/x/collection': 'v1', 'users/x/mask': 'v1'})
        answerBands(['elevation'])
        expect(session.choices('masking-1')).toEqual(['elevation'])

        session.advance(270000)
        answerVersions({'users/x/collection': 'v2', 'users/x/mask': 'v1'})
        expect(session.choices('masking-1')).toEqual([])
        answerBands(['slope'])

        expect(session.choices('masking-1')).toEqual(['slope'])
    })

    it('waits while the evidence of what it was described from is first being read', () => {
        const session = sessionHolding([bandMath('users/x/dem')])
        session.watch('band-math-1')

        answerBands()

        expect(session.decide('band-math-1')).toBe('RESOLVING')
        expect(session.retrieveRead('band-math-1').output.diagnostics).toEqual([{code: 'ASSETS_PENDING', assetId: 'users/x/dem'}])
    })

    it.each([
        ['blocks once its evidence has outlived its authority', session => {
            session.hide()
            session.advance(300000)
        }, 'BLOCKED', 'ASSETS_EXPIRED'],
        ['blocks when reading its evidence fails', session => {
            session.advance(270000)
            failVersions()
        }, 'BLOCKED', 'ASSETS_UNAVAILABLE']
    ])('%s', (_case, change, status, code) => {
        const session = describedBandMath()

        change(session)

        expect(session.decide('band-math-1')).toBe(status)
        expect(session.retrieveRead('band-math-1').output.diagnostics).toEqual([{code, assetId: 'users/x/dem'}])
    })

    it('is authorized again by a read reporting the same token, without describing it again', () => {
        const session = describedBandMath()
        session.advance(270000)
        failVersions()
        expect(session.decide('band-math-1')).toBe('BLOCKED')

        session.advance(270000)
        answerVersions({'users/x/dem': 'v1'})

        expect(session.decide('band-math-1')).toBe('RETRIEVABLE')
        expect(imageObservations()).toHaveLength(1)
    })
})

describe('an asset found missing', () => {
    it('withholds an output described from configuration alone, and a read finding it again restores it', () => {
        const session = sessionHolding([remapping('users/x/landcover')])
        session.watch('remapping-1')
        answerVersions({'users/x/landcover': 'v1'})
        expect(session.read('remapping-1').status).toBe('READY')

        session.advance(270000)
        answerVersions({'users/x/landcover': MISSING})
        expect(session.read('remapping-1')).toMatchObject({
            status: 'UNAVAILABLE', diagnostics: [{code: 'ASSET_UNAVAILABLE', assetId: 'users/x/landcover'}]
        })
        session.advance(270000)
        answerVersions({'users/x/landcover': 'v1'})

        expect(session.read('remapping-1').status).toBe('READY')
    })
})

describe('an explicit refresh', () => {
    it('of a successful answer reads its assets at once and observes it again, reusing nothing observed before', async () => {
        const session = describedBandMath()

        const refreshed = session.runtime.refreshOutput(QUESTION)
        expect(versionReads()).toEqual([['users/x/dem'], ['users/x/dem']])
        answerVersions({'users/x/dem': 'v1'})
        await refreshed

        expect(session.read('band-math-1').status).toBe('NEEDS_EVIDENCE')
        expect(imageObservations()).toHaveLength(2)
        answerBands()
        expect(session.read('band-math-1').status).toBe('READY')
    })

    it('of one output observes again what an earlier refresh of another output observed of the same image', async () => {
        const first = maskingOver('users/x/collection')
        const second = {...first, id: 'masking-2'}
        const versions = {'users/x/collection': 'v1', 'users/x/mask': 'v1'}
        const session = sessionHolding([first, second])
        session.watch(first.id)
        session.watch(second.id)
        answerVersions(versions)
        answerBands(['elevation'])
        expect(fake.bands).toHaveLength(1)
        const refreshedFirst = session.runtime.refreshOutput({recipeId: first.id, product: {name: 'IMAGE_OUTPUT'}})
        answerVersions(versions)
        await refreshedFirst
        answerBands(['elevation'])

        const refreshedSecond = session.runtime.refreshOutput({recipeId: second.id, product: {name: 'IMAGE_OUTPUT'}})
        answerVersions(versions)
        await refreshedSecond

        expect(fake.bands).toHaveLength(3)
    })

    it('settles when the runtime closes before its reads answer, counting no refresh and reading nothing more', async () => {
        const session = describedBandMath()
        let refreshed = false
        session.runtime.refreshOutput(QUESTION).then(() => refreshed = true)

        session.runtime.close()
        await settled()
        session.advance(600000)

        expect(refreshed).toBe(true)
        expect(session.store.getState().process.sourceRefreshes).toBeUndefined()
        expect(versionReads()).toHaveLength(2)
    })

    it('asked for by a map layer and a Retrieve together is made once', async () => {
        const session = describedBandMath()

        const refreshed = Promise.all([session.runtime.refreshOutput(QUESTION), session.runtime.refreshOutput(QUESTION)])
        answerVersions({'users/x/dem': 'v1'})
        await refreshed

        expect(versionReads()).toHaveLength(2)
        expect(imageObservations()).toHaveLength(2)
        expect(session.store.getState().process.sourceRefreshes.recipes).toEqual({'band-math-1': 1})
    })

    it('of an answer described from configuration alone reads its assets again and is counted, for its preview', async () => {
        const session = sessionHolding([remapping('users/x/landcover')])
        session.watch('remapping-1')
        answerVersions({'users/x/landcover': 'v1'})

        const refreshed = session.runtime.refreshOutput({recipeId: 'remapping-1', product: {name: 'IMAGE_OUTPUT'}})
        answerVersions({'users/x/landcover': 'v1'})
        await refreshed

        expect(versionReads()).toEqual([['users/x/landcover'], ['users/x/landcover']])
        expect(session.store.getState().process.sourceRefreshes.recipes).toEqual({'remapping-1': 1})
        expect(fake.bands).toHaveLength(0)
    })
})

// Mutations this session made, as the asset browser records them, and what the task-to-assets route would deliver.
describe('an asset this session changed', () => {
    it('deleted in the browser authorizes nothing at once, and withholds every output reading it once found missing', async () => {
        const session = describedBandMath([remapping('users/x/dem')])
        session.watch('remapping-1')
        answerVersions({'users/x/dem': 'v1'})

        session.mutate([['users', 'x', 'dem']])
        session.catalogue([])
        expect(session.decide('band-math-1')).toBe('RESOLVING')
        session.advance(0)
        answerVersions({'users/x/dem': MISSING})

        expect(session.read('band-math-1').diagnostics).toEqual([{code: 'ASSET_UNAVAILABLE', assetId: 'users/x/dem'}])
        expect(session.read('remapping-1').diagnostics).toEqual([{code: 'ASSET_UNAVAILABLE', assetId: 'users/x/dem'}])
        expect(session.store.getState().assets.user).toEqual([])
    })

    it('replaced by an export whose token lags is described again once the token changes, and authorizes nothing before', async () => {
        const session = sessionHolding([maskingOver('users/x/collection')])
        session.watch('masking-1')
        answerVersions({'users/x/collection': 'v1', 'users/x/mask': 'v1'})
        answerBands(['elevation'])

        session.mutate([['users', 'x', 'collection']])
        session.advance(0)
        answerVersions({'users/x/collection': 'v1'})
        await settled()
        expect(session.decide('masking-1')).toBe('RESOLVING')
        expect(fake.bands).toHaveLength(1)
        session.advance(3000)
        answerVersions({'users/x/collection': 'v2'})
        answerBands(['slope'])

        expect(session.choices('masking-1')).toEqual(['slope'])
        expect(session.retrieveRead('masking-1').output).toMatchObject({status: 'READY', diagnostics: []})
    })

    it('renamed is read under both its old and its new id', () => {
        const session = sessionHolding([remapping('users/x/old'), remapping('users/x/new', 'remapping-2')])
        session.watch('remapping-1')
        session.watch('remapping-2')
        answerVersions({'users/x/old': 'v1', 'users/x/new': MISSING})
        expect(session.read('remapping-2').status).toBe('UNAVAILABLE')

        session.mutate([['users', 'x', 'old'], ['users', 'x', 'new']])
        session.advance(0)
        answerVersions({'users/x/old': MISSING, 'users/x/new': 'v2'})

        expect(session.read('remapping-1').diagnostics).toEqual([{code: 'ASSET_UNAVAILABLE', assetId: 'users/x/old'}])
        expect(session.read('remapping-2').status).toBe('READY')
    })

    it('by an export that failed after writing some of a collection is described again from what it holds', async () => {
        const session = sessionHolding([maskingOver('users/x/collection')])
        session.watch('masking-1')
        answerVersions({'users/x/collection': 'v1', 'users/x/mask': 'v1'})
        answerBands(['elevation'])

        session.mutate([['users', 'x', 'collection']])
        session.advance(0)
        answerVersions({'users/x/collection': 'v-partial'})

        expect(fake.bands).toHaveLength(2)
        answerBands(['elevation'])
        expect(session.retrieveRead('masking-1').output).toMatchObject({status: 'READY', diagnostics: []})
    })
})

describe('failures naming an asset', () => {
    it('read it once for every consumer reporting them, and not again while its token is unchanged', async () => {
        const session = sessionHolding([bandMath('users/x/dem')])
        session.watch('band-math-1')
        session.watch('band-math-1')
        answerVersions({'users/x/dem': 'v1'})

        failBands(eeFailure('Image.load: Image asset \'users/x/dem\' not found (does not exist or caller does not have access).'))
        session.runtime.reportFailure({error: eeFailure('Image asset \'users/x/dem\' not found'), assets: ['users/x/dem']})
        answerVersions({'users/x/dem': 'v1'})
        await settled()
        session.runtime.reportFailure({error: eeFailure('Image asset \'users/x/dem\' not found'), assets: ['users/x/dem']})

        expect(versionReads()).toEqual([['users/x/dem'], ['users/x/dem']])
        expect(imageObservations()).toHaveLength(1)
        expect(session.read('band-math-1').status).toBe('UNAVAILABLE')
    })

    it('recover by themselves once the read finds another token', () => {
        const session = sessionHolding([bandMath('users/x/dem')])
        session.watch('band-math-1')
        answerVersions({'users/x/dem': 'v1'})

        failBands(eeFailure('Image.load: Image asset \'users/x/dem\' not found'))
        answerVersions({'users/x/dem': 'v2'})
        answerBands()

        expect(session.read('band-math-1').status).toBe('READY')
    })

    it('missing when first read is described again once it is created', () => {
        const session = sessionHolding([bandMath('users/x/dem')])
        session.watch('band-math-1')
        answerVersions({'users/x/dem': MISSING})
        failBands(eeFailure('Image.load: Image asset \'users/x/dem\' not found (does not exist or caller does not have access).'))

        session.advance(270000)
        answerVersions({'users/x/dem': 'v1'})
        answerBands()

        expect(session.read('band-math-1').status).toBe('READY')
    })

    it('read it again whatever the failure says of it, without taking it for missing', () => {
        const session = sessionHolding([bandMath('users/x/dem'), remapping('users/x/dem')])
        session.watch('band-math-1')
        session.watch('remapping-1')
        answerVersions({'users/x/dem': 'v1'})

        failBands(eeFailure('Image.load: Asset \'users/x/dem\' is not an Image.'))

        expect(versionReads()).toEqual([['users/x/dem'], ['users/x/dem']])
        expect(session.read('remapping-1').status).toBe('READY')
    })

    it('read nothing again when the failure says nothing about an input', () => {
        const session = sessionHolding([bandMath('users/x/dem')])
        session.watch('band-math-1')
        answerVersions({'users/x/dem': 'v1'})

        failBands(eeFailure('Line 1: Unknown variable i2'))

        expect(versionReads()).toEqual([['users/x/dem']])
    })

    it('read every asset an operation read when it asks for bands they do not hold', () => {
        const session = sessionHolding([bandMath('users/x/dem')])
        session.watch('band-math-1')
        answerVersions({'users/x/dem': 'v1'})

        failBands(eeFailure('Image.select: Pattern \'elevation\' did not match any bands.'))

        expect(versionReads()).toEqual([['users/x/dem'], ['users/x/dem']])
    })
})

// A Band Math including a band its asset turns out not to hold. Earth Engine refuses the image selecting it, so that
// observation fails; the asset's own description is what establishes the band is missing.
describe('a Band Math including a band its input asset lacks', () => {
    const ELEVATION = [{name: 'elevation', arrayDimensions: 0}]
    const SLOPE_ONLY = [{name: 'slope', arrayDimensions: 0}]
    const SELECTION_REFUSED = eeFailure('Image.select: Band pattern \'elevation\' did not match any bands.')

    const lackingElevation = () => {
        const session = sessionHolding([bandMath('users/x/dem')])
        session.watch('band-math-1')
        answerVersions({'users/x/dem': 'v1'})
        answerAsset('users/x/dem', SLOPE_ONLY)
        failBands(SELECTION_REFUSED)
        return session
    }

    it('is invalid where the band is included, and reads the asset again for the failure beside it', () => {
        const session = lackingElevation()

        expect(session.read('band-math-1')).toMatchObject({
            status: 'INVALID',
            diagnostics: [{code: 'MISSING_INPUT_BAND', path: ['model', 'inputImagery', 'images', 0, 'includedBands', 0]}]
        })
        expect(versionReads()).toEqual([['users/x/dem'], ['users/x/dem']])
    })

    it('is described again, and ready, once the asset is read at another token holding the band', () => {
        const session = lackingElevation()
        answerVersions({'users/x/dem': 'v1'})

        session.advance(270000)
        answerVersions({'users/x/dem': 'v2'})
        answerAsset('users/x/dem', ELEVATION)
        answerBands()

        expect(session.read('band-math-1').status).toBe('READY')
    })

    it('is described again, and ready, on an explicit refresh though its token is unchanged', async () => {
        const session = lackingElevation()
        answerVersions({'users/x/dem': 'v1'})

        const refreshed = session.runtime.refreshOutput(QUESTION)
        answerVersions({'users/x/dem': 'v1'})
        await refreshed
        answerAsset('users/x/dem', ELEVATION)
        answerBands()

        expect(session.read('band-math-1').status).toBe('READY')
    })

    it('is not decided by an answer about a configuration since edited', () => {
        const session = sessionHolding([bandMath('users/x/dem')])
        session.watch('band-math-1')
        answerVersions({'users/x/dem': 'v1'})
        const superseded = imageObservations()

        session.edit(withIncludedBand(bandMath('users/x/dem'), 'slope'))
        superseded.forEach(request => {
            request.answered = true
            request.subscriber.next([{name: 'scaled', arrayDimensions: 0}])
            request.subscriber.complete()
        })
        answerAsset('users/x/dem', ELEVATION)
        failBands(eeFailure('Image.select: Band pattern \'slope\' did not match any bands.'))

        expect(session.read('band-math-1')).toMatchObject({
            status: 'INVALID',
            diagnostics: [{code: 'MISSING_INPUT_BAND', path: ['model', 'inputImagery', 'images', 0, 'includedBands', 0]}]
        })
    })
})

// A Stack over two assets, one reported without a band's dimensionality - which no other evidence repairs - and one
// that could not be read. The description is invalid on the first; the second still failed.
describe('a diagnosis settled beside a failed observation', () => {
    const STACK = Object.freeze({recipeId: 'stack-1', product: {name: 'IMAGE_OUTPUT'}})
    const TOKENS = Object.freeze({'users/x/dem': 'v1', 'users/x/water': 'v1'})

    const diagnosedBesideFailure = () => {
        const session = sessionHolding([stackOver('users/x/dem', 'users/x/water')])
        session.watch('stack-1')
        answerVersions(TOKENS)
        answerAsset('users/x/dem', [{name: 'elevation'}])
        failAsset('users/x/water', eeFailure('Image.load: Image asset \'users/x/water\' not found'))
        return session
    }

    it('is invalid on the diagnosis, and reads again the asset the failure names', () => {
        const session = diagnosedBesideFailure()

        expect(session.read('stack-1')).toMatchObject({status: 'INVALID', diagnostics: [{code: 'INCOMPLETE_IMAGE_OUTPUT'}]})
        expect(versionReads().slice(1)).toEqual([['users/x/water']])
    })

    it('is kept, observing nothing again, while every token is unchanged', () => {
        const session = diagnosedBesideFailure()
        const observed = fake.bands.length

        for (let poll = 0; poll < 3; poll++) {
            answerVersions(TOKENS)
            session.advance(270000)
        }
        answerVersions(TOKENS)

        expect(session.read('stack-1').status).toBe('INVALID')
        expect(fake.bands).toHaveLength(observed)
    })

    it('is described again once a token changes', () => {
        const session = diagnosedBesideFailure()
        answerVersions(TOKENS)

        session.advance(270000)
        answerVersions({...TOKENS, 'users/x/dem': 'v2'})
        answerAsset('users/x/dem', [{name: 'elevation', arrayDimensions: 0}])
        answerAsset('users/x/water', [{name: 'elevation', arrayDimensions: 0}])

        expect(session.read('stack-1').status).toBe('READY')
    })

    it('is described again on an explicit refresh, though no token changed', async () => {
        const session = diagnosedBesideFailure()
        answerVersions(TOKENS)

        const refreshed = session.runtime.refreshOutput(STACK)
        answerVersions(TOKENS)
        await refreshed
        answerAsset('users/x/dem', [{name: 'elevation', arrayDimensions: 0}])
        answerAsset('users/x/water', [{name: 'elevation', arrayDimensions: 0}])

        expect(session.read('stack-1').status).toBe('READY')
    })
})

// A real store holding these records, the runtime over it, and a clock the test moves.
const sessionHolding = records => {
    let now = 0
    let timers = []
    let visible = true
    const store = createStore((state, action) => 'reduce' in action ? action.reduce(state) : state, {
        user: {currentUser: {googleTokens: {}}},
        process: {
            loadedRecipes: Object.fromEntries(records.map(record => [record.id, record])),
            recipes: records.map(({id, type}) => ({id, type, revision: 1})),
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
        loadRecipeListing$: () => of(records.map(({id, type}) => ({id, type, revision: 1}))),
        visible: () => visible,
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
    const heldFor = key => runtime.heldFor(key)
    const retrieveRead = recipeId => readRetrieveOutput({state: store.getState(), recipeId, heldFor, now})
    return {
        runtime,
        store,
        hide: () => visible = false,
        mutate: paths => assetsMutated(paths),
        catalogue: assets => store.dispatch({type: 'ASSETS', reduce: state => ({...state, assets: {...state.assets, user: assets}})}),
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
                currency: recordStalenessOfState(state),
                assetEvidence: assetEvidenceOfState(state)
            })
        },
        retrieveRead,
        decide: recipeId => {
            const {output, pending} = retrieveRead(recipeId)
            return retrieveDecision({output, pending, names: output.bands.map(({name}) => name), destination: 'GEE'}).status
        },
        choices: recipeId => retrieveRead(recipeId).output.bands.map(({name}) => name),
        watch: recipeId => runtime.watchOutput$({recipeId, product: {name: 'IMAGE_OUTPUT'}}).subscribe(),
        edit: record => store.dispatch({
            type: 'EDIT',
            reduce: state => ({
                ...state,
                process: {...state.process, loadedRecipes: {...state.process.loadedRecipes, [record.id]: record}}
            })
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

// A Band Math over one asset, watched, its asset read and its output described.
const describedBandMath = (others = [], assetId = 'users/x/dem', versions = {[assetId]: 'v1'}, bands) => {
    const session = sessionHolding([bandMath(assetId), ...others])
    session.watch('band-math-1')
    answerVersions(versions)
    answerBands(bands)
    return session
}

const QUESTION = Object.freeze({recipeId: 'band-math-1', product: {name: 'IMAGE_OUTPUT'}})

const UNVERSIONED = Object.freeze({unversioned: true})
const MISSING = Object.freeze({failure: {kind: 'DEFINITIVE', code: 'NOT_FOUND'}})

const versionReads = () => fake.versionReads.map(({ids}) => ids)

// Answers every version read still waiting with the token each asset has now.
const answerVersions = versions => fake.versionReads.filter(read => !read.answered).forEach(read => {
    read.answered = true
    read.subscriber.next({assets: read.ids.map(id => {
        const answer = versions[id]
        return typeof answer === 'object' ? {id, version: null, ...answer} : {id, type: 'IMAGE', version: answer}
    })})
    read.subscriber.complete()
})

// Lets the reads a settled request was awaited by schedule what follows them.
const settled = () => new Promise(resolve => setTimeout(resolve, 0))

const eeFailure = earthEngineMessage =>
    Object.assign(new Error('ajax error 500'), {status: 500, response: {messageArgs: {earthEngineMessage}}})

const failBands = error => fake.bands.filter(request => !request.answered).forEach(request => {
    request.answered = true
    request.subscriber.error(error)
})

const failVersions = () => fake.versionReads.filter(read => !read.answered).forEach(read => {
    read.answered = true
    read.subscriber.error(new Error('Service unavailable'))
})

// Answers every observation still waiting with these bands, or else an asset with the band the Band Math fixture includes
// of it and a recipe's image with the band it outputs.
const answerBands = names => fake.bands.filter(request => !request.answered).forEach(request => {
    request.answered = true
    request.subscriber.next((names || (request.request.asset ? ['elevation'] : ['scaled'])).map(name => ({name, arrayDimensions: 0})))
    request.subscriber.complete()
})

// What Earth Engine was asked of the images recipes build, apart from what it was asked of assets.
const imageObservations = () => fake.bands.filter(({request}) => request.recipe)

const unansweredFor = assetId => fake.bands.filter(request => !request.answered && request.request.asset === assetId)

// Answers what is still waiting to be observed of one asset.
const answerAsset = (assetId, bands) => unansweredFor(assetId).forEach(request => {
    request.answered = true
    request.subscriber.next(bands)
    request.subscriber.complete()
})

const failAsset = (assetId, error) => unansweredFor(assetId).forEach(request => {
    request.answered = true
    request.subscriber.error(error)
})

// The recipe including another band of its input in place of the one it included, read by its calculation.
const withIncludedBand = (recipe, name) => {
    const [image] = recipe.model.inputImagery.images
    return {
        ...recipe,
        model: {
            ...recipe.model,
            inputImagery: {images: [{...image, includedBands: [{id: 'b1', name}]}]},
            calculations: {calculations: recipe.model.calculations.calculations
                .map(calculation => ({...calculation, expression: `i1.${name} * 2`}))}
        }
    }
}

const stackOver = (...assetIds) => ({
    id: 'stack-1',
    type: 'STACK',
    revision: 1,
    ui: {initialized: true},
    model: {
        inputImagery: {images: assetIds.map((id, index) => ({imageId: `i-${index}`, name: `i${index}`, type: 'ASSET', id}))},
        bandNames: {bandNames: assetIds.map((_id, index) => ({
            imageId: `i-${index}`,
            bands: [{id: `b-${index}`, originalName: 'elevation', outputName: `elevation_${index}`}]
        }))}
    }
})

const maskingOver = assetId => ({
    id: 'masking-1',
    type: 'MASKING',
    revision: 1,
    ui: {initialized: true},
    model: {imageToMask: {type: 'ASSET', id: assetId}, imageMask: {type: 'ASSET', id: 'users/x/mask'}}
})

const bandMath = assetId => ({
    id: 'band-math-1',
    type: 'BAND_MATH',
    revision: 1,
    ui: {initialized: true},
    model: {
        inputImagery: {images: [{imageId: 'i-1', name: 'i1', type: 'ASSET', id: assetId, includedBands: [{id: 'b1', name: 'elevation'}]}]},
        calculations: {calculations: [
            {imageId: 'c-1', name: 'c1', type: 'EXPRESSION', expression: 'i1.elevation * 2', dataType: 'int16'}
        ]},
        outputBands: {outputImages: [
            {imageId: 'c-1', outputBands: [{id: 'd', name: 'scaled', defaultOutputName: 'scaled'}]}
        ]}
    }
})

const remapping = (assetId, id = 'remapping-1') => ({
    id,
    type: 'REMAPPING',
    revision: 1,
    ui: {initialized: true},
    model: {
        inputImagery: {images: [{imageId: 'i-1', name: 'i1', type: 'ASSET', id: assetId, includedBands: []}]},
        legend: {entries: [{id: 'e-1', value: 1, color: '#000000', label: 'one'}]}
    }
})
