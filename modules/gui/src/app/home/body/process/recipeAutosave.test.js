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
const {forgetRecipeSaveState, openRecipeRevision, recipePath} = await import('./recipe')
const {draftAgreement} = await import('./draftAgreement')

let store
let loaded
let id = 0

beforeEach(() => {
    server.requests.length = 0
    loaded = {id: `autosave-${++id}`, type: 'BAND_MATH', revision: 1, model: {bands: ['VV', 'VH', 'ratio']}}
    store = storeListing(loaded)
    openRecipeRevision(loaded)
    actionBuilder('OPEN').set('process.tabs', [{id: loaded.id}]).dispatch()
})

afterEach(() => {
    actionBuilder('CLOSE').set('process.tabs', []).dispatch()
    forgetRecipeSaveState(loaded.id)
})

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

describe('the published copy of the acknowledged model', () => {
    // The store copies the acknowledged model into the save state, so the two are never the same object.
    it('agrees with the loaded draft without reading its content', () => {
        const {model, read} = reading(draft().model)

        expect(saveState().model).not.toBe(draft().model)
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

const saveState = () => store.getState().process.saveStates[loaded.id]

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
