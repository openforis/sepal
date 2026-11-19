import {legacy_createStore as createStore} from 'redux'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// A store's recipe session (recipeSession.js) is its own: the claims on its recipe cache are shared by every adapter
// it gives - the UI's and the source runtime's - and by no other store's session. Disposed, it sends nothing it queued,
// starts no save still being compressed, and lets nothing storage answers later change any store, though a write it
// already sent runs to its end: storage may have accepted it. Over the real store, action builder, save coordinator
// and source environment; storage and compression answer when a case says so.

const io = vi.hoisted(() => ({saves: [], compressions: [], reads: []}))

vi.mock('~/apiRegistry', async () => {
    const {Subject} = await import('rxjs')
    return {default: {recipe: {
        save$: request => {
            const response = new Subject()
            io.saves.push({request, response})
            return response
        },
        load$: id => {
            const read = new Subject()
            io.reads.push({id, read})
            return read
        }
    }}}
})
vi.mock('~/gzip', async () => {
    const {Subject} = await import('rxjs')
    return {gzip$: recipe => {
        const compressed = new Subject()
        io.compressions.push({recipe, compressed})
        return compressed
    }}
})
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))

const {actionBuilder} = await import('~/action-builder')
const {initStore} = await import('~/store')
const {recipeSessionOf, startRecipeSession} = await import('./recipeSession')
const {createReduxSourceEnvironment} = await import('../sourceRuntime/reduxSourceEnvironment')

const ID = 'recipe-1'
const RECORD = {id: ID, type: 'BAND_MATH', revision: 1, model: {bands: ['VV', 'VH', 'ratio']}}

const stores = []

beforeEach(() => {
    io.saves = []
    io.compressions = []
    io.reads = []
})

afterEach(() => stores.splice(0).forEach(store => recipeSessionOf(store).dispose()))

describe('a store\'s session', () => {
    it('is started with the store, never by being asked for', () => {
        const store = createStore((state, action) => action.reduce ? action.reduce(state) : state, {process: {loadedRecipes: {}}})

        expect(() => recipeSessionOf(store)).toThrow('No recipe session was started for this store')
    })
})

describe('a disposed session', () => {
    it('sends nothing it queued behind a save in flight, and lets the write already sent run to its end', async () => {
        const store = editing()
        edit(store, ['VV'])
        compress(0)
        edit(store, ['VH'])

        recipeSessionOf(store).dispose()
        expect(io.saves[0].response.observed).toBe(true)
        await acknowledge(0, 2)

        expect(io.compressions).toHaveLength(1)
        expect(io.saves).toHaveLength(1)
    })

    it('starts no save for an edit still being compressed', async () => {
        const store = editing()
        edit(store, ['VV'])

        recipeSessionOf(store).dispose()
        compress(0)
        await answered()

        expect(io.saves).toEqual([])
    })

    it('lets a record its claimant read land in its cache no more', async () => {
        const store = installed({loadedRecipes: {}, recipes: [], tabs: [], saveStates: {}})
        recipeSessionOf(store).claimant().load$(ID).subscribe()

        recipeSessionOf(store).dispose()
        io.reads[0].read.next(RECORD)
        io.reads[0].read.complete()
        await answered()

        expect(held(store)).toBeUndefined()
    })

    it('changes no store for an answer to a save it sent, neither its own nor one installed since', async () => {
        const store = editing()
        edit(store, ['VV'])
        compress(0)
        recipeSessionOf(store).dispose()
        const disposed = store.getState()
        const other = holding({...RECORD, model: {bands: ['HH']}})
        const installed = other.getState()

        await acknowledge(0, 2)

        expect(store.getState()).toBe(disposed)
        expect(other.getState()).toBe(installed)
    })
})

describe('the claims on a session\'s recipe cache', () => {
    it('are shared by the editor\'s claimants and the source runtime\'s, which keep a record until the last lets go', () => {
        const store = holding(RECORD)
        const editor = recipeSessionOf(store).claimant()
        const watch = createReduxSourceEnvironment({store}).recipeCacheClaimant()
        editor.use(ID)
        watch.use(ID)

        editor.release()
        expect(held(store)).toBeDefined()
        watch.release()

        expect(held(store)).toBeUndefined()
    })

    it('are not another store\'s: each lets its own record go when its own last claimant does', () => {
        const first = holding(RECORD)
        const second = holding(RECORD)
        const firstClaimant = recipeSessionOf(first).claimant()
        const secondClaimant = recipeSessionOf(second).claimant()
        firstClaimant.use(ID)
        secondClaimant.use(ID)

        firstClaimant.release()

        expect(held(first)).toBeUndefined()
        expect(held(second)).toBeDefined()
        secondClaimant.release()
        expect(held(second)).toBeUndefined()
    })
})

// A store installed with the record loaded through its session, open in a tab, as a recipe being edited is.
const editing = () => {
    const store = installed({loadedRecipes: {}, recipes: [{id: ID, revision: RECORD.revision}], tabs: [], saveStates: {}})
    recipeSessionOf(store).openRecipeRevision(RECORD)
    store.dispatch(actionBuilder('OPEN').set('process.tabs', [{id: ID}]).build())
    return store
}

// A store installed already holding the record, closed and listed.
const holding = record =>
    installed({loadedRecipes: {[record.id]: {...record, ui: {initialized: true}}}, recipes: [{id: record.id, revision: record.revision}], tabs: [], saveStates: {}})

// Installed with its session, as the application installs its store (index.jsx).
const installed = process => {
    const store = createStore((state, action) => action.reduce ? action.reduce(state) : state, {process})
    initStore(store)
    startRecipeSession(store)
    stores.push(store)
    return store
}

const edit = (store, bands) =>
    store.dispatch(actionBuilder('EDIT_BANDS').set(['process.loadedRecipes', ID, 'model', 'bands'], bands).build())

const compress = index => {
    const {recipe, compressed} = io.compressions[index]
    compressed.next(recipe)
    compressed.complete()
}

// What storage answers is taken up once the promise a save is awaited through settles.
const acknowledge = async (index, revision) => {
    io.saves[index].response.next({revision})
    io.saves[index].response.complete()
    await answered()
}

const answered = () => new Promise(resolve => setTimeout(resolve, 0))

const held = store => store.getState().process.loadedRecipes[ID]
