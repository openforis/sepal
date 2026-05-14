import {of} from 'rxjs'
import {vi} from 'vitest'

import {handleGuiAction} from '~/app/home/body/chat/guiActionRegistry'
import {addHash, getHash} from '~/hash'

import {registerProjectActions} from './projectActions'
import {registerRecipeActions} from './recipeActions'

const {recipeState, projectState, loadedRecipe, store, loadRecipes$, loadProjects$} = vi.hoisted(() => ({
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
    store: {recipes: undefined, projects: undefined, loadedRecipes: {}},
    loadRecipes$: vi.fn(),
    loadProjects$: vi.fn()
}))

vi.mock('~/store', () => ({
    select: vi.fn(path => {
        if (path === 'process.recipes') return store.recipes
        if (path === 'process.projects') return store.projects
        if (Array.isArray(path) && path[0] === 'process.loadedRecipes') return store.loadedRecipes[path[1]]
        return undefined
    }),
    subscribe: vi.fn()
}))

// Spy only the lazy-load entry points; everything else from ../recipe stays real.
vi.mock('../recipe', async importOriginal => ({
    ...await importOriginal(),
    loadRecipes$,
    loadProjects$
}))

// A recipe in process.loadedRecipes has already been through initializeRecipe,
// which stamps the model hash.
addHash(loadedRecipe.model)

registerRecipeActions()
registerProjectActions()

beforeEach(() => {
    store.recipes = recipeState
    store.projects = projectState
    store.loadedRecipes = {r1: loadedRecipe}
    loadRecipes$.mockReset().mockReturnValue(of(null))
    loadProjects$.mockReset().mockReturnValue(of(null))
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

it('loads recipes before listing when process.recipes is empty', () => {
    store.recipes = []

    handleGuiAction('list-recipes', {respond: () => {}})

    expect(loadRecipes$).toHaveBeenCalled()
})

it('loads projects before listing when process.projects is empty', () => {
    store.projects = []

    handleGuiAction('list-projects', {respond: () => {}})

    expect(loadProjects$).toHaveBeenCalled()
})
