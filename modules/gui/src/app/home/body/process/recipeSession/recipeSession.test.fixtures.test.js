import {legacy_createStore as createStore} from 'redux'
import {firstValueFrom} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// A test ending through the session fixtures (recipeSession.test.fixtures.js) fails for any save storage refused or could
// not process, once every session it installed is disposed - so nothing a disposed session was still doing reaches
// storage after. Over the real store, session and storage fake; compression answers when a case says so.

const io = vi.hoisted(() => ({storage: null, compressions: []}))

vi.mock('~/apiRegistry', () => ({default: {recipe: {
    save$: request => io.storage.save$(request),
    load$: id => io.storage.load$(id)
}}}))
vi.mock('~/gzip', async () => {
    const {Subject} = await import('rxjs')
    return {gzip$: recipe => {
        const compressed = new Subject()
        io.compressions.push({recipe, compressed})
        return compressed
    }}
})
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/translate', () => ({msg: key => key}))

const {actionBuilder} = await import('~/action-builder')
const {disposeInstalledSessions, installStore, openStoredRecipe} = await import('./recipeSession.test.fixtures')
const {checkSaves, recipeStorage} = await import('./recipeStorage.test.fixtures')

const ID = 'recipe-1'
const RECORD = {id: ID, type: 'BAND_MATH', revision: 1, model: {bands: ['VV', 'VH']}}
const OTHER = {...RECORD, id: 'recipe-2'}

beforeEach(() => {
    io.storage = recipeStorage({records: [RECORD, OTHER]})
    io.compressions = []
})

afterEach(disposeInstalledSessions)

describe('a test ending', () => {
    it('fails for a save storage refused, naming the recipe, the revision it expected and what storage answered', async () => {
        const store = editing()
        io.storage.store({...RECORD, revision: 2})
        edit(store, ['VV'])
        await compress(0)

        expect(disposeInstalledSessions).toThrow('recipe-1, expecting revision 1: 412 RECIPE_REVISION_CONFLICT (stored at revision 2)')
    })

    it('fails for a save storage could not process', async () => {
        await firstValueFrom(io.storage.save$({id: ID, type: RECORD.type, gzippedContents: new Uint8Array([1, 2, 3]), expectedRevision: 1}))
            .catch(() => {})

        expect(checkSaves).toThrow('recipe-1, expecting revision 1: 500')
    })

    it('fails again for a storage that refuses again, once its earlier refusal was reported', async () => {
        await refusedSave()
        expect(checkSaves).toThrow('recipe-1, expecting revision 7: 412')
        expect(checkSaves).not.toThrow()

        await refusedSave()

        expect(checkSaves).toThrow('recipe-1, expecting revision 7: 412')
    })

    it('disposes every session before it fails, so a save still being compressed is never sent', async () => {
        const store = editing(OTHER)
        io.storage.store({...RECORD, revision: 2})
        edit(store, ['VV'])
        await compress(0)
        edit(store, ['VH'], OTHER.id)
        const sent = io.storage.saves.length

        expect(disposeInstalledSessions).toThrow('412')
        await compress(1)

        expect(io.storage.saves).toHaveLength(sent)
    })

    it('passes once storage accepted what it received, whatever was still being compressed', async () => {
        const store = editing()
        edit(store, ['VV'])
        await compress(0)
        edit(store, ['VH'])

        expect(disposeInstalledSessions).not.toThrow()
        expect(io.storage.stored(ID).model.bands).toEqual(['VV'])
    })
})

// A store installed with the records opened as navigation opens them.
const editing = (...others) => {
    const records = [RECORD, ...others]
    const store = installStore(createStore((state, action) => action.reduce ? action.reduce(state) : state, {
        process: {loadedRecipes: {}, recipes: records.map(({id, revision}) => ({id, revision})), tabs: [], saveStates: {}}
    }))
    records.forEach(({id}) => openStoredRecipe(store, io.storage, id))
    return store
}

const edit = (store, bands, id = ID) =>
    store.dispatch(actionBuilder('EDIT_BANDS').set(['process.loadedRecipes', id, 'model', 'bands'], bands).build())

const refusedSave = () =>
    firstValueFrom(io.storage.save$({id: ID, type: RECORD.type, gzippedContents: RECORD, expectedRevision: 7})).catch(() => {})

// The save compressed, and what storage answers taken up once the promise it is awaited through settles.
const compress = async index => {
    const {recipe, compressed} = io.compressions[index]
    compressed.next(recipe)
    compressed.complete()
    await new Promise(resolve => setTimeout(resolve, 0))
}
