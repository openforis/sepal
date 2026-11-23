import {legacy_createStore as createStore} from 'redux'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// Autosave and save evidence over the real store and action builder. Publishing a save state notifies the store's
// listeners synchronously, re-entering the autosave, and the store copies what it publishes. Mocks that only record
// actions keep identities and skip those nested notifications, so they cannot show either.
const server = vi.hoisted(() => ({requests: [], stored: null}))

vi.mock('~/apiRegistry', async () => {
    const {of, Subject} = await import('rxjs')
    return {default: {recipe: {
        save$: request => {
            const response = new Subject()
            server.requests.push({request, response})
            return response
        },
        load$: () => of(server.stored)
    }}}
})
vi.mock('~/gzip', async () => {
    const {of} = await import('rxjs')
    return {gzip$: recipe => of(recipe)}
})
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: vi.fn()}}))

const {actionBuilder} = await import('~/action-builder')
const {initStore} = await import('~/store')
const {hasUnsavedWork, openRecipeRevision, recipePath} = await import('./recipe')
const {draftAgreement} = await import('./recipeSession/draftAgreement')
const {recipeSessionOf, startRecipeSession} = await import('./recipeSession/recipeSession')

const LOADED = {id: 'recipe-1', type: 'BAND_MATH', revision: 1, model: {bands: ['VV', 'VH', 'ratio']}}

let store
let loaded
const stores = []

beforeEach(() => {
    server.requests.length = 0
    server.stored = null
    loaded = LOADED
    store = storeListing(loaded)
    openRecipeRevision(loaded)
    actionBuilder('OPEN').set('process.tabs', [{id: loaded.id}]).dispatch()
})

afterEach(() => stores.splice(0).forEach(installed => recipeSessionOf(installed).dispose()))

describe('an edit', () => {
    it('is saved once and settles, though publishing its save state re-enters the autosave', async () => {
        expect(() => edit(['VV', 'VH'])).not.toThrow()

        expect(server.requests.map(({request}) => request.gzippedContents.model.bands)).toEqual([['VV', 'VH']])
        expect(saveState().status).toBe('SAVING')

        acknowledge(0, 2)
        await vi.waitFor(() => expect(saveState().status).toBe('SAVED'))

        expect(server.requests).toHaveLength(1)
        expect(draft().revision).toBe(2)
        expect(agreement({knownRevision: 2})).toBe('AGREED')
    })

    it('leaves the draft\'s revision as it was while it moved on before its save was acknowledged', async () => {
        edit(['VV', 'VH'])
        edit(['VV'])

        acknowledge(0, 2)
        await vi.waitFor(() => expect(server.requests).toHaveLength(2))

        expect(draft().revision).toBe(1)
        expect(saveState().revision).toBe(2)
    })

    it('queued behind another stays unacknowledged until its own save is acknowledged', async () => {
        edit(['VV', 'VH'])
        edit(['VV'])

        acknowledge(0, 2)
        await vi.waitFor(() => expect(server.requests).toHaveLength(2))

        expect(agreement({knownRevision: 2})).toBe('SAVE_PENDING')

        acknowledge(1, 3)
        await vi.waitFor(() => expect(saveState().status).toBe('SAVED'))

        expect(agreement({knownRevision: 3})).toBe('AGREED')
    })

    it('whose acknowledgement was lost agrees once storage shows what was sent', async () => {
        edit(['VV', 'VH'])
        server.stored = {...server.requests[0].request.gzippedContents, revision: 2}

        server.requests[0].response.error({status: 503})
        await vi.waitFor(() => expect(saveState().status).toBe('SAVED'))

        expect(saveState().revision).toBe(2)
        expect(agreement({knownRevision: 2})).toBe('AGREED')
    })
})

describe('the acknowledged model, as the save state names it', () => {
    it('agrees with the loaded draft without reading its content', () => {
        const {model, read} = reading(draft().model)

        expect(draftAgreement({draft: {...draft(), model}, saveState: saveState(), knownRevision: 1})).toBe('AGREED')
        expect(read).toEqual([])
    })

    it('agrees with an equal model that replaced the draft, without saving it', () => {
        expect(() => actionBuilder('REPLACE_WITH_EQUAL_MODEL')
            .set(recipePath(loaded.id, 'model'), {...draft().model})
            .dispatch()).not.toThrow()

        expect(server.requests).toHaveLength(0)
        expect(agreement({knownRevision: 1})).toBe('AGREED')
    })
})

describe('a notification that changes no recipe', () => {
    it('reads no recipe, whether the action is unrelated or changes only the listing or the tabs', () => {
        const {model: other, read} = reading({id: 'other', type: 'BAND_MATH', model: {bands: ['B1']}, ui: {}})
        store = storeHolding({other})
        read.length = 0

        actionBuilder('SET_STREAM_STATUS').set(['stream', 'component', 'load'], 'ACTIVE').dispatch()
        actionBuilder('SET_RECIPE_REVISION').set(['process.recipes', {id: 'other'}, 'revision'], 2).dispatch()
        actionBuilder('SELECT_TAB').set(['process.tabs', {id: 'other'}, 'selected'], true).dispatch()

        expect(read).toEqual([])
        expect(server.requests).toHaveLength(0)
    })
})

describe('an edit to one recipe', () => {
    it('is saved without reading the recipes it left unchanged', () => {
        const {model: other, read} = reading({id: 'other', type: 'BAND_MATH', model: {bands: ['B1']}, ui: {}})
        store = storeHolding({[loaded.id]: draft(), other})
        read.length = 0

        edit(['VV', 'VH'])

        expect(server.requests.map(({request}) => request.gzippedContents.model.bands)).toEqual([['VV', 'VH']])
        expect(read).toEqual([])
    })
})

describe('an edit to a recipe storage does not list', () => {
    it('is not saved, nor once the recipe is listed', () => {
        actionBuilder('UNLIST').del(['process.recipes', {id: loaded.id}]).dispatch()

        edit(['VV', 'VH'])
        actionBuilder('LIST').push('process.recipes', {id: loaded.id, revision: 1}).dispatch()

        expect(server.requests).toHaveLength(0)
    })
})

describe('a recipe closed once its saves have settled', () => {
    it('is released, with its save state, when its last claimant lets go', async () => {
        const editor = claim()
        edit(['VV', 'VH'])
        acknowledge(0, 2)
        await vi.waitFor(() => expect(saveState().status).toBe('SAVED'))

        close()
        editor.release()

        expect(draft()).toBeUndefined()
        expect(saveState()).toBeUndefined()
    })

    it('stays, with its save state, while another consumer still reads it', async () => {
        const editor = claim()
        const dependent = claim()
        edit(['VV', 'VH'])
        acknowledge(0, 2)
        await vi.waitFor(() => expect(saveState().status).toBe('SAVED'))

        close()
        editor.release()

        expect(draft().model.bands).toEqual(['VV', 'VH'])
        expect(saveState().status).toBe('SAVED')

        dependent.release()

        expect(draft()).toBeUndefined()
        expect(saveState()).toBeUndefined()
    })

    it('keeps its acknowledged revision listed, and saves on top of it once reopened', async () => {
        const editor = claim()
        edit(['VV', 'VH'])
        acknowledge(0, 2)
        await vi.waitFor(() => expect(saveState().status).toBe('SAVED'))
        close()
        editor.release()

        expect(listed().revision).toBe(2)

        openRecipeRevision({...loaded, revision: 2, model: {bands: ['VV', 'VH']}})
        actionBuilder('OPEN').set('process.tabs', [{id: loaded.id}]).dispatch()
        edit(['VV'])

        expect(server.requests.map(({request}) => request.expectedRevision)).toEqual([1, 2])
    })
})

describe('a recipe closed while it is saving', () => {
    it('keeps its draft until the save settles, then is released', async () => {
        const editor = claim()
        edit(['VV', 'VH'])
        close()
        editor.release()

        expect(draft().model.bands).toEqual(['VV', 'VH'])
        expect(saveState().status).toBe('SAVING')

        acknowledge(0, 2)
        await vi.waitFor(() => expect(draft()).toBeUndefined())

        expect(saveState()).toBeUndefined()
        expect(listed().revision).toBe(2)
    })

    it('stays, once the save settles, while another consumer still reads it', async () => {
        const editor = claim()
        const dependent = claim()
        edit(['VV', 'VH'])
        close()
        editor.release()

        acknowledge(0, 2)
        await vi.waitFor(() => expect(saveState().status).toBe('SAVED'))

        expect(draft().model.bands).toEqual(['VV', 'VH'])

        dependent.release()

        expect(draft()).toBeUndefined()
        expect(saveState()).toBeUndefined()
    })

    it('is not released by an earlier save completing while a newer one is pending', async () => {
        const editor = claim()
        edit(['VV', 'VH'])
        edit(['VV'])
        close()
        editor.release()

        acknowledge(0, 2)
        await vi.waitFor(() => expect(server.requests).toHaveLength(2))

        expect(draft().model.bands).toEqual(['VV'])
        expect(saveState().status).toBe('SAVING')

        acknowledge(1, 3)
        await vi.waitFor(() => expect(draft()).toBeUndefined())

        expect(saveState()).toBeUndefined()
    })

    it('keeps a draft whose save was refused', async () => {
        const editor = claim()
        edit(['VV', 'VH'])
        close()
        editor.release()

        server.requests[0].response.error({status: 400})
        await vi.waitFor(() => expect(saveState().status).toBe('FAILED'))

        expect(draft().model.bands).toEqual(['VV', 'VH'])
    })

    it('keeps a draft whose save conflicts with storage', async () => {
        const editor = claim()
        edit(['VV', 'VH'])
        close()
        editor.release()
        server.stored = {...loaded, model: {bands: ['HH']}, revision: 7}

        server.requests[0].response.error({status: 503})
        await vi.waitFor(() => expect(saveState().status).toBe('CONFLICT'))

        expect(draft().model.bands).toEqual(['VV', 'VH'])
    })
})

describe('an edit to a recipe closed once its save was acknowledged', () => {
    it('is not saved, nor taken for what was persisted', async () => {
        edit(['VV', 'VH'])
        acknowledge(0, 2)
        await vi.waitFor(() => expect(saveState().status).toBe('SAVED'))
        close()

        edit(['VV'])

        expect(server.requests).toHaveLength(1)
        expect(agreement({knownRevision: 2})).not.toBe('AGREED')
    })
})

describe('leaving the page', () => {
    it('is held back while an edit is saving, until storage acknowledges it', async () => {
        edit(['VV', 'VH'])

        expect(hasUnsavedWork(store.getState())).toBe(true)

        acknowledge(0, 2)
        await vi.waitFor(() => expect(saveState().status).toBe('SAVED'))

        expect(hasUnsavedWork(store.getState())).toBe(false)
    })

    it('is held back by an edit whose save was refused', async () => {
        edit(['VV', 'VH'])

        server.requests[0].response.error({status: 400})
        await vi.waitFor(() => expect(saveState().status).toBe('FAILED'))

        expect(hasUnsavedWork(store.getState())).toBe(true)
    })

    it('is held back by a recipe never saved', () => {
        actionBuilder('CREATE_RECIPE').set(recipePath('new'), {id: 'new', ui: {unsaved: true}}).dispatch()

        expect(hasUnsavedWork(store.getState())).toBe(true)
    })
})

describe('the published save state', () => {
    it('names the acknowledged model by its change identifier instead of holding a copy', async () => {
        edit(['VV', 'VH'])
        acknowledge(0, 2)
        await vi.waitFor(() => expect(saveState().status).toBe('SAVED'))

        expect(saveState()).not.toHaveProperty('model')
        expect(agreement({knownRevision: 2})).toBe('AGREED')
    })

    it('compares by content an acknowledged model the store gave no identifier', async () => {
        // A recipe written whole carries a model without a change identifier of its own.
        actionBuilder('REPLACE_RECIPE').set(recipePath(loaded.id), {...draft(), model: {bands: ['VV']}}).dispatch()
        acknowledge(0, 2)
        await vi.waitFor(() => expect(saveState().status).toBe('SAVED'))

        expect(agreementWith({bands: ['VV']})).toBe('AGREED')
        expect(agreementWith({bands: ['VH']})).toBe('UNSAVED')
    })
})

// Each store has a session of its own: what one saves, compares or is acknowledged for never reaches another, though
// both hold the same recipe and the other is the store now installed.
describe('a store installed after another', () => {
    it('is left as it is by an acknowledgement of a save started in the other, which settles there', async () => {
        edit(['VV', 'VH'])
        const [saving] = server.requests
        const first = store
        const other = storeHolding({[loaded.id]: {...loaded, model: {bands: ['HH']}, ui: {initialized: true}}})
        const before = other.getState()

        saving.response.next({revision: 2})
        saving.response.complete()
        await vi.waitFor(() => expect(first.getState().process.saveStates[loaded.id].status).toBe('SAVED'))

        expect(first.getState().process.recipes.find(({id}) => id === loaded.id).revision).toBe(2)
        expect(other.getState()).toBe(before)
    })

    it('saves nothing of its own record for a notification that changes it not, whatever the other compared or saved', async () => {
        edit(['VV', 'VH'])
        acknowledge(0, 2)
        await vi.waitFor(() => expect(saveState().status).toBe('SAVED'))
        server.requests.length = 0
        storeHolding({[loaded.id]: {...loaded, model: {bands: ['HH']}, ui: {initialized: true}}})

        actionBuilder('SET_STREAM_STATUS').set(['stream', 'component', 'load'], 'ACTIVE').dispatch()

        expect(server.requests).toEqual([])
    })
})

const storeListing = recipe => {
    let published = 0
    const created = createStore((state, action) => {
        // Bound a regression so it reports recursion rather than overflowing the JavaScript stack.
        if (action.type === 'SET_SAVE_STATE' && ++published > 20) {
            throw new Error('Autosave repeatedly published save state for the same edit')
        }
        return action.reduce ? action.reduce(state) : state
    }, {process: {loadedRecipes: {}, recipes: [{id: recipe.id, revision: recipe.revision}], tabs: []}})
    initStore(created)
    startRecipeSession(created)
    stores.push(created)
    return created
}

// A store installed already holding these records, listed and open, with its session, which starts from them.
const storeHolding = recipes => {
    const ids = Object.keys(recipes)
    const created = createStore((state, action) => action.reduce ? action.reduce(state) : state, {
        process: {loadedRecipes: recipes, recipes: ids.map(id => ({id, revision: 1})), tabs: ids.map(id => ({id})), saveStates: {}}
    })
    initStore(created)
    startRecipeSession(created)
    stores.push(created)
    return created
}

const edit = bands =>
    actionBuilder('EDIT_BANDS')
        .set(recipePath(loaded.id, 'model.bands'), bands)
        .dispatch()

const acknowledge = (request, revision) => {
    server.requests[request].response.next({revision})
    server.requests[request].response.complete()
}

const draft = () => store.getState().process.loadedRecipes[loaded.id]

const saveState = () => store.getState().process.saveStates?.[loaded.id]

const listed = () => store.getState().process.recipes.find(({id}) => id === loaded.id)

const claim = () => {
    const claimant = recipeSessionOf(store).claimant()
    claimant.use(loaded.id)
    return claimant
}

const close = () => actionBuilder('CLOSE').set('process.tabs', []).dispatch()

const agreementWith = model => draftAgreement({draft: {...draft(), model}, saveState: saveState(), knownRevision: 2})

const agreement = ({knownRevision}) => draftAgreement({draft: draft(), saveState: saveState(), knownRevision})

// The model as a view that records which of its properties are read.
const reading = target => {
    const read = []
    const model = new Proxy(target, {
        get: (object, key, receiver) => {
            if (Object.prototype.propertyIsEnumerable.call(object, key)) {
                read.push(key)
            }
            return Reflect.get(object, key, receiver)
        },
        ownKeys: object => {
            read.push('keys')
            return Reflect.ownKeys(object)
        }
    })
    return {model, read}
}
