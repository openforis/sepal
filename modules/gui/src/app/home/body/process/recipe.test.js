import {beforeEach, describe, expect, it, test, vi} from 'vitest'

const dispatched = []

// The state the module reads, and the listings it asks storage for.
const session = vi.hoisted(() => ({state: {}, listings: []}))

vi.mock('~/store', () => ({
    select: path => selectPath(session.state, path)
}))

vi.mock('~/apiRegistry', async () => {
    const {Subject} = await import('rxjs')
    return {default: {recipe: {
        loadAll$: () => {
            const response = new Subject()
            session.listings.push(response)
            return response
        }
    }}}
})

vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/translate', () => ({msg: key => key}))

vi.mock('~/action-builder', () => {
    const builder = () => {
        const sets = {}
        const self = {
            set: (path, value) => {
                sets[JSON.stringify(path)] = value
                return self
            },
            push: () => self,
            assign: () => self,
            del: () => self,
            dispatch: () => dispatched.push(sets)
        }
        return self
    }
    return {actionBuilder: builder, scopedActionBuilder: () => builder}
})

vi.mock('~/widget/tabs/tabActions', () => ({
    addTab: () => ({id: 'copy-id', type: 'process', placeholder: 'new'}),
    closeTab: () => {}
}))

vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))

const {duplicateRecipe, loadRecipes$, recipePath, saveRecipe} = await import('./recipe')

beforeEach(() => {
    dispatched.length = 0
})

test('a duplicated recipe does not retain the source revision', () => {
    duplicateRecipe({id: 'r1', type: 'MOSAIC', title: 'Original', revision: 7, model: {a: 1}, ui: {}})

    const copy = dispatched.at(-1)[JSON.stringify(recipePath('copy-id'))]
    expect(copy.revision).toBeUndefined()
    expect(copy.model).toEqual({a: 1})
})

describe('renaming a recipe tab', () => {
    it('gives a recipe in its setup wizard the new title', () => {
        const recipe = newRecipe()
        session.state = withLoadedRecipes(recipe)

        saveRecipe({id: recipe.id, title: 'toto'})

        expect(dispatched.at(-1)[JSON.stringify(recipePath(recipe.id, 'title'))]).toEqual('toto')
    })

    it('creates no recipe for a tab that holds none', () => {
        session.state = withLoadedRecipes()

        saveRecipe({id: 'landing-tab', title: 'toto'})

        expect(dispatched).toEqual([])
    })
})

const selectPath = (state, path) => (Array.isArray(path) ? path : [path])
    .filter(segment => segment !== undefined)
    .flatMap(segment => typeof segment === 'string' ? segment.split('.') : [segment])
    .reduce((value, segment) => {
        if (value === undefined) {
            return undefined
        }
        return typeof segment === 'object'
            ? value.find(entry => Object.entries(segment).every(([key, expected]) => entry[key] === expected))
            : value[segment]
    }, state)

// The session's first listing is merged like any other: a recipe whose save completed while it was asked for stays.
test('the first listing keeps a recipe saved while it was in flight', () => {
    session.state = {process: {
        loadedRecipes: {}, recipes: [{id: 'created', name: 'created'}], recipeListing: {epoch: 0},
        saveStates: {created: {status: 'SAVING'}}, tabs: []
    }}
    loadRecipes$().subscribe()
    session.state.process.saveStates = {created: {status: 'SAVED', revision: 1}}

    session.listings.at(-1).next([{id: 'other', name: 'other'}])

    const listed = dispatched.map(sets => sets[JSON.stringify('process.recipes')]).filter(Boolean).at(-1)
    expect(listed.map(({id}) => id)).toEqual(['other', 'created'])
})

const newRecipe = () => ({
    id: 'r1',
    type: 'CLASSIFICATION',
    placeholder: 'Classification_2026-10-15_10-00-00',
    ui: {unsaved: true}
})

const withLoadedRecipes = (...recipes) => ({
    process: {loadedRecipes: Object.fromEntries(recipes.map(recipe => [recipe.id, recipe]))}
})
