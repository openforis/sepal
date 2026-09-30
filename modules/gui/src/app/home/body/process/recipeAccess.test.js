import {of} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

// The session's recipe cache, on the one question a refreshing read raises: whether the response may be
// written. Reading past the cache is what a consumer asks for when it has learned its copy is behind; what
// it must never do is replace a recipe the user has meanwhile opened and started editing.
//
// `compose` is the identity here, so the HOC is its class and its methods can be called directly.

vi.mock('~/compose', () => ({
    compose: (Component, ..._wrappers) => Component,
    composeHoC: () => Component => Component
}))

vi.mock('~/connect', () => ({connect: () => Component => Component}))

const load$ = vi.fn()
vi.mock('~/apiRegistry', () => ({default: {recipe: {load$: (...args) => load$(...args)}}}))

const dispatched = []
vi.mock('~/action-builder', () => ({
    actionBuilder: type => ({
        set(path, value) {
            this.action = {type, path, value}
            return this
        },
        del(path) {
            this.action = {type, path}
            return this
        },
        dispatch() {
            dispatched.push(this.action)
        }
    })
}))

const isRecipeOpen = vi.fn()
const draft = vi.fn()
vi.mock('~/store', () => ({select: (...args) => draft(...args)}))
vi.mock('./recipe', () => ({
    isRecipeOpen: (...args) => isRecipeOpen(...args),
    recipePath: id => ['process.loadedRecipes', id]
}))

vi.mock('./recipeTypeRegistry', () => ({getRecipeType: () => undefined}))

const {recipeAccess} = await import('./recipeAccess')

const PERSISTED = {id: 'source-1', type: 'CCDC', model: {presets: ['persisted']}, revision: 4}
const DRAFT = {id: 'source-1', type: 'CCDC', model: {presets: ['edited']}, revision: 3}

// What the session holds for the recipe; it holds no save state for it.
const holding = record => draft.mockImplementation(path => path[0] === 'process.loadedRecipes' ? record : undefined)

const access = (loadedRecipes = {}) => {
    const Hoc = recipeAccess()(() => null)
    return new Hoc({loadedRecipes})
}

beforeEach(() => {
    dispatched.length = 0
    load$.mockReset()
    isRecipeOpen.mockReset()
    draft.mockReset()
})

describe('a refreshing read of a recipe nobody is editing', () => {
    beforeEach(() => {
        load$.mockReturnValue(of(PERSISTED))
        isRecipeOpen.mockReturnValue(false)
    })

    it('reads past the cache, even when it holds that recipe', () => {
        let result
        access({'source-1': DRAFT}).reloadRecipe$('source-1').subscribe(recipe => result = recipe)

        expect(load$).toHaveBeenCalledWith('source-1')
        expect(result.model.presets).toEqual(['persisted'])
    })

    it('writes what it read into the cache', () => {
        access().reloadRecipe$('source-1').subscribe()

        expect(dispatched).toEqual([{
            type: 'CACHE_RECIPE',
            path: ['process.loadedRecipes', 'source-1'],
            value: expect.objectContaining({id: 'source-1', model: {presets: ['persisted']}})
        }])
    })
})

// A copy read after the one now requested was sent is newer than its response.
describe('a refreshing read overtaken by a newer copy', () => {
    const NEWER = {...PERSISTED, model: {presets: ['newer']}, revision: 5}

    beforeEach(() => {
        load$.mockReturnValue(of(PERSISTED))
        isRecipeOpen.mockReturnValue(false)
        holding(NEWER)
    })

    it('does not replace it', () => {
        access({'source-1': NEWER}).reloadRecipe$('source-1').subscribe()

        expect(dispatched).toEqual([])
    })

    it('hands the caller the newer copy', () => {
        let result
        access({'source-1': NEWER}).reloadRecipe$('source-1').subscribe(recipe => result = recipe)

        expect(result).toBe(NEWER)
    })
})

// The decision is made when the response arrives, not when it was asked for. Between those two moments the
// user can open the recipe, and the draft they are now editing is not something a dependency read may
// overwrite - nor may the caller go on reading a version the session has moved past.
describe('a refreshing read of a recipe opened while it was in flight', () => {
    beforeEach(() => {
        load$.mockReturnValue(of(PERSISTED))
        isRecipeOpen.mockReturnValue(true)
        holding(DRAFT)
    })

    it('does not write it into the cache', () => {
        access().reloadRecipe$('source-1').subscribe()

        expect(dispatched).toEqual([])
    })

    it('hands the caller the draft the session is editing', () => {
        let result
        access().reloadRecipe$('source-1').subscribe(recipe => result = recipe)

        expect(result).toBe(DRAFT)
    })

    it('hands back what it read when the session has no record after all', () => {
        holding(undefined)
        let result
        access().reloadRecipe$('source-1').subscribe(recipe => result = recipe)

        expect(result.id).toBe('source-1')
        expect(dispatched).toEqual([])
    })
})

// Closed while its saves are unsettled, the recipe still holds its edit (draftAgreement.js).
describe('a refreshing read of a closed recipe whose save has not settled', () => {
    beforeEach(() => {
        load$.mockReturnValue(of(PERSISTED))
        isRecipeOpen.mockReturnValue(false)
        draft.mockImplementation(path => ({
            'process.loadedRecipes.source-1': DRAFT,
            'process.saveStates.source-1': {status: 'SAVING', revision: 3, model: {presets: ['old']}}
        })[path.join('.')])
    })

    it('does not replace the unsaved draft, and hands it to the caller', () => {
        let result
        access({'source-1': DRAFT}).reloadRecipe$('source-1').subscribe(recipe => result = recipe)

        expect(dispatched).toEqual([])
        expect(result).toBe(DRAFT)
    })
})

describe('an ordinary read', () => {
    it('answers from the cache without reading at all', () => {
        let result
        access({'source-1': DRAFT}).loadRecipe$('source-1').subscribe(recipe => result = recipe)

        expect(load$).not.toHaveBeenCalled()
        expect(result).toBe(DRAFT)
    })
})
