import {beforeEach, describe, expect, it, test, vi} from 'vitest'

const dispatched = []

// The session the module reads, and the one listener it registers on loaded recipes: the autosave.
const session = vi.hoisted(() => ({state: {}, autosave: null, saves: [], listings: []}))

vi.mock('~/store', () => ({
    select: path => selectPath(session.state, path),
    subscribe: (_path, listener) => {
        session.autosave = listener
        return () => {}
    }
}))

vi.mock('~/apiRegistry', async () => {
    const {Subject} = await import('rxjs')
    return {default: {recipe: {
        save$: request => {
            const response = new Subject()
            session.saves.push({request, respond: body => {
                response.next(body)
                response.complete()
            }})
            return response
        },
        load$: () => new Subject(),
        loadAll$: () => {
            const response = new Subject()
            session.listings.push(response)
            return response
        }
    }}}
})

vi.mock('~/gzip', async () => {
    const {of} = await import('rxjs')
    return {gzip$: recipe => of(recipe)}
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

const {duplicateRecipe, loadRecipes$, openRecipeRevision, recipePath, saveRecipe, saveStatePath} = await import('./recipe')

beforeEach(() => {
    dispatched.length = 0
    session.saves = []
})

test('a duplicated recipe does not retain the source revision', () => {
    duplicateRecipe({id: 'r1', type: 'MOSAIC', title: 'Original', revision: 7, model: {a: 1}, ui: {}})

    const copy = dispatched.at(-1)[JSON.stringify(recipePath('copy-id'))]
    expect(copy.revision).toBeUndefined()
    expect(copy.model).toEqual({a: 1})
})

// An open, saved recipe acknowledged by the server while its draft may have moved on.
describe('saving an open recipe', () => {
    const OPENED = {content: 'opened'}

    const opened = (id, model = OPENED) => {
        const draft = {id, type: 'MOSAIC', model, ui: {initialized: true}}
        session.state = {process: {
            loadedRecipes: {[id]: draft},
            recipes: [{id, revision: 4}],
            tabs: [{id}]
        }}
        openRecipeRevision({id, revision: 4, model})
        return draft
    }

    const edit = (id, model) => {
        session.state.process.loadedRecipes = {
            ...session.state.process.loadedRecipes,
            [id]: {...session.state.process.loadedRecipes[id], model}
        }
    }

    const acknowledge = async revision => {
        session.saves.at(-1).respond({revision})
        await new Promise(resolve => setTimeout(resolve, 0))
    }

    const draftRevisions = id => dispatched
        .map(sets => sets[JSON.stringify(recipePath(id, 'revision'))])
        .filter(revision => revision !== undefined)

    const savedState = id => dispatched
        .map(sets => sets[JSON.stringify(saveStatePath(id))])
        .filter(Boolean)
        .at(-1)

    it('gives the draft the acknowledged revision when the draft is what was acknowledged', async () => {
        opened('a')
        edit('a', {content: 'edited'})
        saveRecipe({id: 'a'})

        await acknowledge(5)

        expect(draftRevisions('a')).toEqual([5])
    })

    it('leaves the revision off a draft edited again before the acknowledgement arrived', async () => {
        opened('a')
        edit('a', {content: 'edited'})
        saveRecipe({id: 'a'})
        edit('a', {content: 'edited again'})

        await acknowledge(5)

        expect(draftRevisions('a')).toEqual([])
        expect(savedState('a')).toMatchObject({revision: 5, model: {content: 'edited'}})
    })

    // The autosave saves a recipe the first time it sees it, so that save is acknowledged first.
    it('treats a new model object with the same content as what was persisted', async () => {
        const draft = opened('a-equal')
        session.autosave(session.state.process.loadedRecipes)
        await acknowledge(5)
        const replaced = {...draft.model}
        edit('a-equal', replaced)

        session.autosave(session.state.process.loadedRecipes)

        expect(session.saves).toHaveLength(1)
        expect(savedState('a-equal')).toMatchObject({status: 'SAVED', revision: 5})
        expect(savedState('a-equal').model).toBe(replaced)
    })

    // Closed, so the autosave sends nothing for it: other content is not persisted content.
    it('does not treat other content as persisted when nothing saves it', async () => {
        const draft = opened('a-closed')
        session.autosave(session.state.process.loadedRecipes)
        await acknowledge(5)
        session.state.process.tabs = []
        edit('a-closed', {content: 'elsewhere'})

        session.autosave(session.state.process.loadedRecipes)

        expect(savedState('a-closed').model).toBe(draft.model)
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
