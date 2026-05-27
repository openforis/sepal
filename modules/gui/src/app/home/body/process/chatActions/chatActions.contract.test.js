import {of} from 'rxjs'
import {vi} from 'vitest'

import {handleGuiAction} from '~/app/home/body/chat/guiActionRegistry'
import {gzip$} from '~/gzip'
import {addHash, getHash} from '~/hash'

import {registerMapActions} from './mapActions'
import {registerProjectActions} from './projectActions'
import {registerRecipeActions} from './recipeActions'

const {
    recipeState, projectState, loadedRecipe, store, loadRecipes$, loadProjects$,
    isRecipeOpen, openRecipeInNewTab, selectRecipe, apiRecipeSave$, apiRecipeLoad$
} = vi.hoisted(() => ({
    recipeState: [{id: 'r1', type: 'MOSAIC', name: 'Kenya', projectId: 'p1'}],
    projectState: [{id: 'p1', name: 'Kenya'}],
    loadedRecipe: {
        id: 'r1',
        type: 'CLASSIFICATION',
        title: 'Kenya land cover',
        projectId: 'p1',
        model: {trainingData: {dataSets: []}, classifier: {type: 'RANDOM_FOREST'}},
        ui: {initialized: true},
        layers: {areas: {}}
    },
    store: {
        recipes: undefined, projects: undefined, loadedRecipes: {},
        selectedTabId: undefined, tabs: undefined, mapView: undefined
    },
    loadRecipes$: vi.fn(),
    loadProjects$: vi.fn(),
    isRecipeOpen: vi.fn(),
    openRecipeInNewTab: vi.fn(),
    selectRecipe: vi.fn(),
    apiRecipeSave$: vi.fn(),
    apiRecipeLoad$: vi.fn()
}))

vi.mock('~/apiRegistry', () => ({
    default: {recipe: {save$: apiRecipeSave$, load$: apiRecipeLoad$}}
}))

// gzip$ is a passthrough here so the object handed to api.recipe.save$ as
// gzippedContents is the persisted recipe itself (post-omit). That makes the
// persisted model readable from the save$ call for write-then-read assertions.
vi.mock('~/gzip', () => ({gzip$: vi.fn(recipe => of(recipe))}))

vi.mock('~/store', () => ({
    dispatch: vi.fn(),
    select: vi.fn(path => {
        if (path === 'process.recipes') return store.recipes
        if (path === 'process.projects') return store.projects
        if (path === 'process.selectedTabId') return store.selectedTabId
        if (path === 'process.tabs') return store.tabs
        if (path === 'map.view') return store.mapView
        if (Array.isArray(path) && path[0] === 'process.loadedRecipes') return store.loadedRecipes[path[1]]
        return undefined
    }),
    subscribe: vi.fn()
}))

// Spy only the lazy-load entry points; everything else from ../recipe stays real.
vi.mock('../recipe', async importOriginal => ({
    ...await importOriginal(),
    loadRecipes$,
    loadProjects$,
    isRecipeOpen,
    openRecipeInNewTab,
    selectRecipe
}))

// A recipe in process.loadedRecipes has already been through initializeRecipe,
// which stamps the model hash.
addHash(loadedRecipe.model)

registerRecipeActions()
registerProjectActions()
registerMapActions()

beforeEach(() => {
    store.recipes = recipeState
    store.projects = projectState
    store.loadedRecipes = {r1: loadedRecipe}
    store.selectedTabId = undefined
    store.tabs = undefined
    store.mapView = undefined
    loadRecipes$.mockReset().mockReturnValue(of(null))
    loadProjects$.mockReset().mockReturnValue(of(null))
    isRecipeOpen.mockReset().mockReturnValue(false)
    openRecipeInNewTab.mockReset()
    selectRecipe.mockReset()
    apiRecipeSave$.mockReset()
    apiRecipeLoad$.mockReset()
    gzip$.mockReset().mockImplementation(recipe => of(recipe))
})

it('handles the list-recipes action and responds with a {success, data} envelope carrying the recipe list', () => {
    let response
    const handled = handleGuiAction('list-recipes', {respond: r => { response = r }})

    expect(handled).toBe(true)
    expect(response).toEqual({success: true, data: recipeState})
})

it('handles the list-projects action and responds with a {success, data} envelope carrying the project list', () => {
    let response
    const handled = handleGuiAction('list-projects', {respond: r => { response = r }})

    expect(handled).toBe(true)
    expect(response).toEqual({success: true, data: projectState})
})

it('handles the load-recipe action and responds with a {success, data} envelope that carries the model hash and excludes ui/layers', () => {
    const hashBefore = getHash(loadedRecipe.model)
    let response
    const handled = handleGuiAction('load-recipe', {recipeId: 'r1', respond: r => { response = r }})

    expect(handled).toBe(true)
    expect(response.success).toBe(true)
    expect(response.data.modelHash).toBe(hashBefore)
    expect(response.data).not.toHaveProperty('ui')
    expect(response.data).not.toHaveProperty('layers')
})

it('does not mutate the loaded recipe model when reading it (load-recipe is a pure read)', () => {
    const hashBefore = getHash(loadedRecipe.model)

    handleGuiAction('load-recipe', {recipeId: 'r1', respond: () => {}})

    expect(getHash(loadedRecipe.model)).toBe(hashBefore)
})

describe('recipe-metadata', () => {

    it('responds with the four identity fields for a recipe resolved from the saved list', () => {
        store.loadedRecipes = {}
        let response
        const handled = handleGuiAction('recipe-metadata', {recipeId: 'r1', respond: r => { response = r }})

        expect(handled).toBe(true)
        expect(response).toEqual({
            success: true,
            data: {id: 'r1', type: 'MOSAIC', name: 'Kenya', projectId: 'p1'}
        })
    })

    it('does not return the model or any heavy field', () => {
        store.loadedRecipes = {}
        let response
        handleGuiAction('recipe-metadata', {recipeId: 'r1', respond: r => { response = r }})

        expect(response.data).not.toHaveProperty('model')
        expect(response.data).not.toHaveProperty('ui')
        expect(response.data).not.toHaveProperty('layers')
        expect(response.data).not.toHaveProperty('modelHash')
    })

    it('resolves identity from a recipe present only in process.loadedRecipes (open/unsaved)', () => {
        store.recipes = []
        store.loadedRecipes = {'r-open': {
            id: 'r-open', type: 'MOSAIC', title: 'Unsaved mosaic', projectId: 'p2',
            model: {a: 1}, ui: {initialized: true}, layers: {areas: {}}
        }}
        let response

        handleGuiAction('recipe-metadata', {recipeId: 'r-open', respond: r => { response = r }})

        expect(response).toEqual({
            success: true,
            data: {id: 'r-open', type: 'MOSAIC', name: 'Unsaved mosaic', projectId: 'p2'}
        })
    })

    it('returns no heavy fields for a loaded-only recipe', () => {
        store.recipes = []
        store.loadedRecipes = {'r-open': {
            id: 'r-open', type: 'MOSAIC', title: 'Unsaved mosaic', projectId: 'p2',
            model: {a: 1}, ui: {initialized: true}, layers: {areas: {}}
        }}
        let response

        handleGuiAction('recipe-metadata', {recipeId: 'r-open', respond: r => { response = r }})

        expect(response.data).not.toHaveProperty('model')
        expect(response.data).not.toHaveProperty('ui')
        expect(response.data).not.toHaveProperty('layers')
        expect(response.data).not.toHaveProperty('modelHash')
    })

    it('responds with a structured not-found envelope when absent from both loadedRecipes and recipes', () => {
        let response
        handleGuiAction('recipe-metadata', {recipeId: 'r-missing', respond: r => { response = r }})

        expect(response).toEqual({
            success: false,
            error: {code: 'RECIPE_NOT_FOUND', message: expect.stringContaining('r-missing')}
        })
    })

    it('loads recipes before resolving when the recipe is not already loaded and process.recipes is empty', () => {
        store.recipes = []
        store.loadedRecipes = {}

        handleGuiAction('recipe-metadata', {recipeId: 'r1', respond: () => {}})

        expect(loadRecipes$).toHaveBeenCalled()
    })

    it('rejects a call with no recipeId', () => {
        let response
        handleGuiAction('recipe-metadata', {respond: r => { response = r }})

        expect(response).toEqual({success: false, error: expect.stringMatching(/recipeId/i)})
    })
})

describe('recipe-patch', () => {

    let mosaicRecipe, baseHash

    beforeEach(async () => {
        const {getRecipeDefaults} = await import('recipes')
        const mosaicModel = {
            ...getRecipeDefaults('MOSAIC'),
            aoi: {type: 'POLYGON', path: [[36.7, -1.4], [37.0, -1.4], [37.0, -1.1]]}
        }
        mosaicRecipe = {
            id: 'mosaic1',
            type: 'MOSAIC',
            title: 'Kenya mosaic',
            projectId: 'p1',
            model: mosaicModel,
            ui: {initialized: true},
            layers: {areas: {}}
        }
        addHash(mosaicRecipe.model)
        baseHash = getHash(mosaicRecipe.model)
        store.loadedRecipes = {mosaic1: mosaicRecipe}
        apiRecipeSave$.mockReturnValue(of({}))
    })

    const replaceSeasonEnd = {op: 'replace', path: '/dates/seasonEnd', value: '2026-09-01'}

    function patch(overrides) {
        let response
        const handled = handleGuiAction('recipe-patch', {
            recipeId: 'mosaic1',
            baseModelHash: baseHash,
            operations: [replaceSeasonEnd],
            respond: r => { response = r },
            ...overrides
        })
        return {handled, response}
    }

    // With the gzip$ passthrough mock, save$ receives the persisted recipe as
    // gzippedContents, so the persisted (post-patch) model is readable here.
    function persistedModel() {
        return apiRecipeSave$.mock.calls[0][0].gzippedContents.model
    }

    it('responds with {summary, modelHash, invalidatedPaths} for a valid MOSAIC patch on a known recipe', () => {
        const {handled, response} = patch({})

        expect(handled).toBe(true)
        expect(response.success).toBe(true)
        expect(response.data).toEqual({
            summary: expect.any(String),
            modelHash: expect.any(String),
            invalidatedPaths: ['/dates/seasonEnd']
        })
    })

    it('returns a new modelHash when the patch actually changes the model', () => {
        const {response} = patch({})

        expect(response.data.modelHash).not.toBe(baseHash)
    })

    it('reuses baseModelHash and does not persist when the patch is a no-op (test op only)', () => {
        const {response} = patch({operations: [{op: 'test', path: '/dates/type', value: 'YEARLY_TIME_SCAN'}]})

        expect(response.success).toBe(true)
        expect(response.data.modelHash).toBe(baseHash)
        expect(apiRecipeSave$).not.toHaveBeenCalled()
    })

    it('returns STALE_WRITE with currentModelHash when baseModelHash does not match', () => {
        const {response} = patch({baseModelHash: 'h-stale'})

        expect(response.success).toBe(false)
        expect(response.error).toMatchObject({
            code: 'STALE_WRITE',
            message: expect.any(String),
            currentModelHash: baseHash
        })
    })

    it('returns VALIDATION_FAILED with structured per-path errors when the post-apply model is invalid', () => {
        const {response} = patch({operations: [{op: 'remove', path: '/dates'}]})

        expect(response.success).toBe(false)
        expect(response.error.code).toBe('VALIDATION_FAILED')
        expect(Array.isArray(response.error.errors)).toBe(true)
        expect(response.error.errors.length).toBeGreaterThan(0)
        response.error.errors.forEach(error => {
            expect(error).toMatchObject({path: expect.any(String), message: expect.any(String), rule: expect.any(String)})
        })
    })

    it('returns INVALID_PATCH for an empty operations array', () => {
        const {response} = patch({operations: []})

        expect(response.error.code).toBe('INVALID_PATCH')
    })

    it('returns INVALID_PATCH for a malformed JSON Pointer', () => {
        const {response} = patch({operations: [{op: 'replace', path: 'dates', value: {}}]})

        expect(response.error.code).toBe('INVALID_PATCH')
    })

    it('returns INVALID_PATCH for an unknown op', () => {
        const {response} = patch({operations: [{op: 'frobnicate', path: '/dates'}]})

        expect(response.error.code).toBe('INVALID_PATCH')
    })

    it('returns PATCH_APPLY_FAILED for a remove on a non-existent path', () => {
        const {response} = patch({operations: [{op: 'remove', path: '/doesNotExist'}]})

        expect(response.error.code).toBe('PATCH_APPLY_FAILED')
    })

    it('returns RECIPE_NOT_FOUND for an unknown recipeId', () => {
        const {response} = patch({recipeId: 'r-missing'})

        expect(response.error.code).toBe('RECIPE_NOT_FOUND')
    })

    it('persists a successful patch through api.recipe.save$ for the recipe', () => {
        patch({})

        expect(apiRecipeSave$).toHaveBeenCalled()
        expect(apiRecipeSave$.mock.calls[0][0]).toMatchObject({
            id: 'mosaic1',
            type: 'MOSAIC',
            projectId: 'p1',
            name: 'Kenya mosaic'
        })
    })

    it('persists the post-patch effective model carrying the patched value', () => {
        const seasonEndBefore = mosaicRecipe.model.dates.seasonEnd

        patch({})

        expect(persistedModel().dates.seasonEnd).toBe('2026-09-01')
        expect(persistedModel().dates.seasonEnd).not.toBe(seasonEndBefore)
    })

    // recipePatch projects stored → effective → applies ops → persists the
    // projection, so any canonicalization in toEffectiveModel rides every
    // patch. A mixed Landsat+Sentinel-2 recipe stored with SR must still carry
    // SR after a patch that does not target corrections — previously, the
    // projection rewrote ['SR','BRDF'] to ['BRDF','CALIBRATE'] and an unrelated
    // cloud patch silently disabled SR.
    it('preserves SR on a mixed-source recipe when ops do not touch corrections', () => {
        mosaicRecipe.model.sources.dataSets = {LANDSAT: ['LANDSAT_9'], SENTINEL_2: ['SENTINEL_2']}
        mosaicRecipe.model.compositeOptions.corrections = ['SR', 'BRDF']
        addHash(mosaicRecipe.model)
        baseHash = getHash(mosaicRecipe.model)

        patch({operations: [{op: 'replace', path: '/compositeOptions/sepalCloudScoreMaxCloudProbability', value: 25}]})

        expect(persistedModel().compositeOptions.corrections).toContain('SR')
    })

    it('returns a modelHash matching the hash of the persisted model', () => {
        const {response} = patch({})

        expect(response.data.modelHash).toBe(getHash(persistedModel()))
    })

    describe('on a failed patch', () => {

        const failureCases = [
            ['STALE_WRITE', {baseModelHash: 'h-stale'}],
            ['VALIDATION_FAILED', {operations: [{op: 'remove', path: '/dates'}]}],
            ['INVALID_PATCH (empty ops)', {operations: []}],
            ['INVALID_PATCH (malformed pointer)', {operations: [{op: 'replace', path: 'dates', value: {}}]}],
            ['INVALID_PATCH (unknown op)', {operations: [{op: 'frobnicate', path: '/dates'}]}],
            ['PATCH_APPLY_FAILED', {operations: [{op: 'remove', path: '/doesNotExist'}]}],
            ['RECIPE_NOT_FOUND', {recipeId: 'r-missing'}]
        ]

        it.each(failureCases)('does not persist and leaves the loaded model unchanged (%s)', (_label, overrides) => {
            const modelRefBefore = mosaicRecipe.model
            const hashBefore = getHash(mosaicRecipe.model)

            const {response} = patch(overrides)

            expect(response.success).toBe(false)
            expect(apiRecipeSave$).not.toHaveBeenCalled()
            expect(mosaicRecipe.model).toBe(modelRefBefore)
            expect(getHash(mosaicRecipe.model)).toBe(hashBefore)
        })
    })
})

describe('create-recipe', () => {

    let validMosaicModel

    beforeEach(async () => {
        const {getRecipeDefaults} = await import('recipes')
        validMosaicModel = {
            ...getRecipeDefaults('MOSAIC'),
            aoi: {type: 'POLYGON', path: [[36.7, -1.4], [37.0, -1.4], [37.0, -1.1]]}
        }
        store.recipes = []
        store.loadedRecipes = {}
        apiRecipeSave$.mockReturnValue(of({}))
    })

    function create(overrides) {
        let response
        const handled = handleGuiAction('create-recipe', {
            type: 'MOSAIC',
            name: 'Kenya mosaic',
            projectId: 'p1',
            model: validMosaicModel,
            respond: r => { response = r },
            ...overrides
        })
        return {handled, response}
    }

    function persistedModel() {
        return apiRecipeSave$.mock.calls[0][0].gzippedContents.model
    }

    it('accepts a valid MOSAIC model and responds with an identity summary', async () => {
        const {handled, response} = create({})
        await flushPersist()

        expect(handled).toBe(true)
        expect(response.success).toBe(true)
        expect(response.data).toMatchObject({type: 'MOSAIC', name: 'Kenya mosaic', projectId: 'p1'})
        expect(response.data.id).toEqual(expect.any(String))
    })

    it('persists the submitted model through api.recipe.save$ on a valid create', async () => {
        create({})
        await flushPersist()

        expect(apiRecipeSave$).toHaveBeenCalled()
        expect(persistedModel()).toMatchObject({aoi: validMosaicModel.aoi})
    })

    it('returns VALIDATION_FAILED with structured per-path errors for a MOSAIC model missing aoi', () => {
        const {ui: _ui, ...defaultsOnly} = validMosaicModel
        const noAoi = (() => { const m = {...defaultsOnly}; delete m.aoi; return m })()

        const {response} = create({model: noAoi})

        expect(response.success).toBe(false)
        expect(response.error.code).toBe('VALIDATION_FAILED')
        expect(Array.isArray(response.error.errors)).toBe(true)
        expect(response.error.errors.length).toBeGreaterThan(0)
        response.error.errors.forEach(error => {
            expect(error).toMatchObject({path: expect.any(String), message: expect.any(String), rule: expect.any(String)})
        })
    })

    it('does not persist on a failed validation', () => {
        const noAoi = {...validMosaicModel}
        delete noAoi.aoi

        create({model: noAoi})

        expect(apiRecipeSave$).not.toHaveBeenCalled()
    })

    it('returns VALIDATION_FAILED when a rule fails (targetDate before the Landsat 4 epoch)', () => {
        const bad = {
            ...validMosaicModel,
            dates: {...validMosaicModel.dates, targetDate: '1970-01-01'}
        }

        const {response} = create({model: bad})

        expect(response.error.code).toBe('VALIDATION_FAILED')
        expect(response.error.errors.some(error => /1982-08-22/.test(error.message))).toBe(true)
        expect(apiRecipeSave$).not.toHaveBeenCalled()
    })

    // Closes the validate-effective-but-persist-raw gap. Validation projects
    // through toEffectiveModel (which strips dormant fields), so a submitted
    // model can validate cleanly while still carrying dormant junk. Persisting
    // the raw submission would let chat-created recipes carry shapes the AI
    // contract says it should not create.
    it('persists the effective model (dormant Sentinel-2 cloud companions stripped on a Landsat-only create)', async () => {
        const withDormantS2 = {
            ...validMosaicModel,
            sources: {cloudPercentageThreshold: 75, dataSets: {LANDSAT: ['LANDSAT_9']}},
            compositeOptions: {
                ...validMosaicModel.compositeOptions,
                includedCloudMasking: ['sepalCloudScore', 'landsatCFMask', 'sentinel2CloudScorePlus'],
                sentinel2CloudScorePlusBand: 'cs_cdf',
                sentinel2CloudScorePlusMaxCloudProbability: 45
            }
        }

        const {response} = create({model: withDormantS2})
        await flushPersist()

        expect(response.success).toBe(true)
        const persisted = persistedModel()
        expect(persisted.compositeOptions.includedCloudMasking).not.toContain('sentinel2CloudScorePlus')
        expect(persisted.compositeOptions).not.toHaveProperty('sentinel2CloudScorePlusBand')
        expect(persisted.compositeOptions).not.toHaveProperty('sentinel2CloudScorePlusMaxCloudProbability')
    })

    // Same projection-on-write contract as recipe-patch: a mixed Landsat+S2
    // create submitted with SR must persist with SR intact. Pre-fix the
    // projection rewrote ['SR','BRDF'] → ['BRDF','CALIBRATE'].
    it('preserves SR when persisting a mixed-source create', async () => {
        const mixedWithSR = {
            ...validMosaicModel,
            sources: {cloudPercentageThreshold: 75, dataSets: {LANDSAT: ['LANDSAT_9'], SENTINEL_2: ['SENTINEL_2']}},
            compositeOptions: {...validMosaicModel.compositeOptions, corrections: ['SR', 'BRDF']}
        }

        const {response} = create({model: mixedWithSR})
        await flushPersist()

        expect(response.success).toBe(true)
        expect(persistedModel().compositeOptions.corrections).toContain('SR')
    })
})

function flushPersist() {
    return Promise.resolve()
}

it('handles the open action, opens the recipe, and responds with a summary', () => {
    let response
    const handled = handleGuiAction('open', {recipeId: 'r1', respond: r => { response = r }})

    expect(handled).toBe(true)
    expect(openRecipeInNewTab).toHaveBeenCalledWith(loadedRecipe)
    expect(response).toEqual({
        success: true,
        data: {id: 'r1', type: 'CLASSIFICATION', name: 'Kenya land cover', projectId: 'p1'}
    })
})

it('handles the open action for an already open recipe by selecting it', () => {
    isRecipeOpen.mockReturnValue(true)
    let response

    handleGuiAction('open', {recipeId: 'r1', respond: r => { response = r }})

    expect(selectRecipe).toHaveBeenCalledWith('r1')
    expect(openRecipeInNewTab).not.toHaveBeenCalled()
    expect(response.success).toBe(true)
})

it('loads recipes before listing when process.recipes is empty', () => {
    store.recipes = []

    handleGuiAction('list-recipes', {respond: () => {}})

    expect(loadRecipes$).toHaveBeenCalled()
})

it('responds with the recipes the lazy load populated when process.recipes started empty', () => {
    store.recipes = []
    loadRecipes$.mockImplementation(() => {
        store.recipes = recipeState
        return of(null)
    })

    let response
    handleGuiAction('list-recipes', {respond: r => { response = r }})

    expect(response).toEqual({success: true, data: recipeState})
})

it('loads projects before listing when process.projects is empty', () => {
    store.projects = []

    handleGuiAction('list-projects', {respond: () => {}})

    expect(loadProjects$).toHaveBeenCalled()
})

it('responds with the projects the lazy load populated when process.projects started empty', () => {
    store.projects = []
    loadProjects$.mockImplementation(() => {
        store.projects = projectState
        return of(null)
    })

    let response
    handleGuiAction('list-projects', {respond: r => { response = r }})

    expect(response).toEqual({success: true, data: projectState})
})

describe('list-map-areas', () => {
    const mapRecipe = {
        id: 'r1', type: 'MOSAIC',
        model: {aoi: {type: 'EE_TABLE', id: 'FAO/GAUL/2015/level0', key: 73}},
        layers: {
            areas: {
                center: {imageLayer: {sourceId: 'this-recipe'}, featureLayers: []}
            },
            additionalImageLayerSources: []
        }
    }
    const mapView = {center: {lat: 1, lng: 36}, zoom: 7, bounds: [[34, -2], [42, 5]]}

    it('returns {available: false, reason: no_active_recipe} when no recipe is selected', () => {
        store.selectedTabId = null

        let response
        const handled = handleGuiAction('list-map-areas', {respond: r => { response = r }})

        expect(handled).toBe(true)
        expect(response).toEqual({success: true, data: {available: false, reason: 'no_active_recipe'}})
    })

    it('returns {available: false, reason: no_active_recipe} when the selected tab has no loaded recipe', () => {
        store.selectedTabId = 'r-missing'
        store.loadedRecipes = {}

        let response
        handleGuiAction('list-map-areas', {respond: r => { response = r }})

        expect(response).toEqual({success: true, data: {available: false, reason: 'no_active_recipe'}})
    })

    it('returns recipe identity, layout, areas, aoi and view for the active recipe', () => {
        store.selectedTabId = 'r1'
        store.loadedRecipes = {r1: mapRecipe}
        store.tabs = [{id: 'r1', title: 'Kenya', type: 'MOSAIC'}]
        store.mapView = mapView

        let response
        handleGuiAction('list-map-areas', {respond: r => { response = r }})

        expect(response).toEqual({
            success: true,
            data: {
                recipeId: 'r1', recipeName: 'Kenya', recipeType: 'MOSAIC',
                layout: 'single',
                areas: [{
                    area: 'center',
                    sourceId: 'this-recipe', sourceType: 'Recipe', isHost: true,
                    sourceLabel: 'self'
                }],
                aoi: {type: 'EE_TABLE', id: 'FAO/GAUL/2015/level0', key: 73},
                view: mapView
            }
        })
    })

    it('names the layout for a split-pane recipe', () => {
        store.selectedTabId = 'r1'
        store.loadedRecipes = {r1: {
            ...mapRecipe,
            layers: {
                areas: {
                    left: {imageLayer: {sourceId: 'this-recipe'}},
                    right: {imageLayer: {sourceId: 'google-satellite'}}
                },
                additionalImageLayerSources: []
            }
        }}
        store.tabs = [{id: 'r1', title: 'Kenya', type: 'MOSAIC'}]

        let response
        handleGuiAction('list-map-areas', {respond: r => { response = r }})

        expect(response.data.layout).toBe('left-right')
        expect(response.data.areas.map(a => a.area).sort()).toEqual(['left', 'right'])
    })
})

describe('list-layers', () => {
    const layerRecipe = {
        id: 'r1', type: 'MOSAIC',
        model: {},
        layers: {
            areas: {
                center: {
                    imageLayer: {
                        sourceId: 'this-recipe',
                        layerConfig: {visParams: {type: 'rgb', bands: ['red', 'green', 'blue']}}
                    },
                    featureLayers: [
                        {sourceId: 'aoi', disabled: false},
                        {sourceId: 'labels', disabled: true}
                    ]
                }
            },
            additionalImageLayerSources: []
        }
    }

    it('returns {available: false, reason: no_active_recipe} when no recipe is selected', () => {
        store.selectedTabId = null

        let response
        const handled = handleGuiAction('list-layers', {respond: r => { response = r }})

        expect(handled).toBe(true)
        expect(response).toEqual({success: true, data: {available: false, reason: 'no_active_recipe'}})
    })

    it('returns per-area imageLayer + featureLayers for the active recipe', () => {
        store.selectedTabId = 'r1'
        store.loadedRecipes = {r1: layerRecipe}
        store.tabs = [{id: 'r1', title: 'Kenya', type: 'MOSAIC'}]

        let response
        handleGuiAction('list-layers', {respond: r => { response = r }})

        expect(response).toEqual({
            success: true,
            data: {
                recipeId: 'r1',
                areas: [{
                    area: 'center',
                    imageLayer: {
                        sourceId: 'this-recipe', sourceType: 'Recipe', isHost: true,
                        sourceLabel: 'self',
                        visualization: {type: 'rgb', bands: ['red', 'green', 'blue']}
                    },
                    featureLayers: [
                        {sourceId: 'aoi', enabled: true},
                        {sourceId: 'labels', enabled: false}
                    ]
                }]
            }
        })
    })

    it('returns a null imageLayer when the area has no source set', () => {
        store.selectedTabId = 'r1'
        store.loadedRecipes = {r1: {
            ...layerRecipe,
            layers: {
                areas: {center: {imageLayer: {}, featureLayers: []}},
                additionalImageLayerSources: []
            }
        }}

        let response
        handleGuiAction('list-layers', {respond: r => { response = r }})

        expect(response.data.areas[0].imageLayer).toBeNull()
    })

    it('omits visualization when the image layer has no visParams', () => {
        store.selectedTabId = 'r1'
        store.loadedRecipes = {r1: {
            ...layerRecipe,
            layers: {
                areas: {center: {imageLayer: {sourceId: 'this-recipe'}, featureLayers: []}},
                additionalImageLayerSources: []
            }
        }}

        let response
        handleGuiAction('list-layers', {respond: r => { response = r }})

        expect(response.data.areas[0].imageLayer).not.toHaveProperty('visualization')
    })
})
