import {of} from 'rxjs'
import {vi} from 'vitest'

import {handleGuiAction} from '~/app/home/body/chat/guiActionRegistry'
import {addHash, getHash} from '~/hash'

import {registerMapActions} from './mapActions'
import {registerProjectActions} from './projectActions'
import {registerRecipeActions} from './recipeActions'

const {
    recipeState, projectState, loadedRecipe, store, loadRecipes$, loadProjects$,
    isRecipeOpen, openRecipeInNewTab, selectRecipe
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
    selectRecipe: vi.fn()
}))

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

    it('responds with the four identity fields for a known recipe id', () => {
        let response
        const handled = handleGuiAction('recipe-metadata', {recipeId: 'r1', respond: r => { response = r }})

        expect(handled).toBe(true)
        expect(response).toEqual({
            success: true,
            data: {id: 'r1', type: 'MOSAIC', name: 'Kenya', projectId: 'p1'}
        })
    })

    it('does not return the model or any heavy field', () => {
        let response
        handleGuiAction('recipe-metadata', {recipeId: 'r1', respond: r => { response = r }})

        expect(response.data).not.toHaveProperty('model')
        expect(response.data).not.toHaveProperty('ui')
        expect(response.data).not.toHaveProperty('layers')
        expect(response.data).not.toHaveProperty('modelHash')
    })

    it('responds with a structured not-found envelope for an unknown recipe id', () => {
        let response
        handleGuiAction('recipe-metadata', {recipeId: 'r-missing', respond: r => { response = r }})

        expect(response).toEqual({
            success: false,
            error: {code: 'RECIPE_NOT_FOUND', message: expect.stringContaining('r-missing')}
        })
    })

    it('loads recipes before resolving when process.recipes is empty', () => {
        store.recipes = []

        handleGuiAction('recipe-metadata', {recipeId: 'r1', respond: () => {}})

        expect(loadRecipes$).toHaveBeenCalled()
    })

    it('rejects a call with no recipeId', () => {
        let response
        handleGuiAction('recipe-metadata', {respond: r => { response = r }})

        expect(response).toEqual({success: false, error: expect.stringMatching(/recipeId/i)})
    })
})

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
