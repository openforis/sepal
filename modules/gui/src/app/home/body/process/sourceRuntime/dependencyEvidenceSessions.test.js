import {legacy_createStore as createStore} from 'redux'
import {NEVER, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {stratumFrameQuestion} from '#sepal/recipe/samplingDesign/stratumFrame'
import {initStore} from '~/store'

// What the source runtime's calculations and frame evidence reads teach the session, and what the session's own
// knowledge withdraws from them, through the runtime as the app composes it over a real store and its Redux adapter.
// Earth Engine's evidence, calculation and asset reads, the recipe listing's own reads and the clock are substituted.

vi.mock('~/apiRegistry', () => ({default: {}}))

const {createReduxSourceEnvironment} = await import('./reduxSourceEnvironment')
const {createSourceRuntime} = await import('./sourceRuntime')

const FRAME = 'SAMPLING_STRATUM_FRAME'
const ASSET = 'users/x/strata'

let store, environment, runtime, clock, frameReads, assetReads, watch

beforeEach(() => {
    frameReads = []
    assetReads = []
    clock = fakeClock()
})

afterEach(() => {
    watch?.unsubscribe()
    runtime?.close()
    environment?.close()
})

describe('what an answer reports it read', () => {
    it('advances the listing to a revision it reports, so a later answer read at an older revision is refused', () => {
        open(recipeDesign(), [{id: 'classification-1', revision: 1}])
        const errors = []
        calculate$().subscribe({error: error => errors.push(error)})

        frameReads[0].response$.next(frame(recipeDesign().model, {revision: 2, digest: 'newer'}))
        calculations[0].next(areasOver(frame(recipeDesign().model, {revision: 1, digest: 'older'})))

        expect(listedRevision('classification-1')).toBe(2)
        expect(errors.map(({code}) => code)).toEqual(['SOURCE_BASIS_CHANGED'])
        expect(published().evidence.digest).toBe('newer')
    })

    it('keeps a revision it reports of a recipe the listing does not list, so a later answer at an older one is refused', () => {
        open(recipeDesign(), [])
        const errors = []
        calculate$().subscribe({error: error => errors.push(error)})

        frameReads[0].response$.next(frame(recipeDesign().model, {revision: 2, digest: 'newer'}))
        calculations[0].next(areasOver(frame(recipeDesign().model, {revision: 1, digest: 'older'})))

        expect(store.getState().process.recipes).toEqual([])
        expect(errors.map(({code}) => code)).toEqual(['SOURCE_BASIS_CHANGED'])
        expect(published().evidence.digest).toBe('newer')
    })

    it('holds back what read an asset at the token the session last read, once a later read reports another', async () => {
        open(assetDesign())
        frameReads[0].response$.next(frame(assetDesign().model, {token: 'v1'}))
        await answerAssets({[ASSET]: 'v1'})
        expect(published().status).toBe('OBSERVED')

        clock.advance(1)
        calculate$().subscribe({error: () => {}})
        calculations[0].next(areasOver(frame(assetDesign().model, {token: 'v2', digest: 'replaced'})))

        expect(published().status).toBe('PENDING')
        clock.advance(3000)
        await answerAssets({[ASSET]: 'v2'})
        expect(frameReads).toHaveLength(2)
    })
})

describe('the frame evidence of an open design', () => {
    it('is withdrawn while a mutation the session made to an asset it read settles', async () => {
        open(assetDesign())
        frameReads[0].response$.next(frame(assetDesign().model, {token: 'v1'}))
        await answerAssets({[ASSET]: 'v1'})

        runtime.invalidateAssets([ASSET])

        expect(published().status).toBe('PENDING')
        expect(frameReads).toHaveLength(1)
    })

    it('is read again once a recipe it read is explicitly refreshed', () => {
        open(recipeDesign())
        frameReads[0].response$.next(frame(recipeDesign().model, {revision: 1}))

        environment.refreshSources({recipes: ['classification-1']})

        expect(frameReads).toHaveLength(2)
    })
})

const calculations = []

const open = (design, recipes = [{id: 'classification-1', revision: 1}]) => {
    calculations.length = 0
    const initial = {
        process: {loadedRecipes: {design}, recipes, tabs: [{id: 'design'}], saveStates: {}}
    }
    store = createStore((state = initial, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    environment = createReduxSourceEnvironment({store})
    runtime = createSourceRuntime({
        environment$: environment.environment$,
        session: environment.session,
        sessionChanges$: environment.sessionChanges$,
        updateRecipeListing: environment.updateRecipeListing,
        updateAssetEvidence: environment.updateAssetEvidence,
        refreshSources: environment.refreshSources,
        writeRecipe: environment.writeRecipe,
        loadDependencyEvidence$: request => {
            const response$ = new Subject()
            frameReads.push({request, response$})
            return response$
        },
        loadAssetVersions$: ids => {
            const response$ = new Subject()
            assetReads.push({ids, response$})
            return response$
        },
        loadRecipeListing$: () => NEVER,
        wakeups$: NEVER,
        visible: () => true,
        clock
    })
    watch = runtime.watchDependencyEvidence$('design').subscribe()
}

const calculate$ = () => runtime.calculate$({
    kind: 'SAMPLING_STRATUM_AREAS',
    question: {scale: 30},
    request$: () => {
        const response$ = new Subject()
        calculations.push(response$)
        return response$
    },
    evidenceOf: ({calculatedFrom}) => [calculatedFrom.dependencies[FRAME]]
})

const answerAssets = async tokens => {
    const pending = assetReads.splice(0)
    pending.forEach(({ids, response$}) => {
        response$.next({assets: ids.map(id => ({id, type: 'IMAGE', version: tokens[id]}))})
        response$.complete()
    })
    await new Promise(resolve => setTimeout(resolve, 0))
}

const recipeDesign = () => design({type: 'RECIPE', recipeId: 'classification-1'})

const assetDesign = () => design({type: 'ASSET', assetId: ASSET})

const design = source => ({
    id: 'design', type: 'SAMPLING_DESIGN', revision: 1, ui: {initialized: true},
    model: {
        aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1], [0, 0]]},
        stratification: {...source, band: 'class', crs: 'EPSG:6933', scale: 30}
    }
})

const frame = (model, {revision = 1, token, digest = 'frame'}) => ({
    dependency: FRAME, contractVersion: 1, question: stratumFrameQuestion(model), digest,
    provenance: {
        recipes: model.stratification.recipeId ? [{id: model.stratification.recipeId, revision}] : [],
        assets: token ? [{id: ASSET, version: token}] : []
    },
    unversioned: []
})

const areasOver = evidence => ({
    groups: [{stratum: 1, area: 100}],
    calculatedFrom: {resource: {id: 'SAMPLING_STRATUM_AREAS', contractVersion: 1}, question: {scale: 30}, dependencies: {[FRAME]: evidence}}
})

const published = () => store.getState().process.loadedRecipes.design.ui.dependencyEvidence[FRAME]

const listedRevision = id => store.getState().process.recipes.find(entry => entry.id === id).revision

const fakeClock = () => {
    let now = 1000
    let timers = []
    return {
        now: () => now,
        setTimeout: (callback, ms) => {
            const timer = {at: now + ms, callback}
            timers.push(timer)
            return timer
        },
        clearTimeout: timer => {
            timers = timers.filter(other => other !== timer)
        },
        advance: ms => {
            now += ms
            const due = timers.filter(({at}) => at <= now)
            timers = timers.filter(timer => !due.includes(timer))
            due.forEach(({callback}) => callback())
        }
    }
}
