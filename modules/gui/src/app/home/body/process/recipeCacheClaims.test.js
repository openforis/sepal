import {of, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// The session's recipe cache, as its claimants use it: whether a response read from storage may be written, and how
// long an entry stays. The decision about a response is made when it arrives, against what the session holds then.
// The session is a plain map here; storage is `load$`.

const load$ = vi.fn()
vi.mock('~/apiRegistry', () => ({default: {recipe: {load$: (...args) => load$(...args)}}}))

const {RecipeCacheClaimant} = await import('./recipeCacheClaims')

const PERSISTED = {id: 'source-1', type: 'CCDC', model: {presets: ['persisted']}, revision: 4}
const DRAFT = {id: 'source-1', type: 'CCDC', model: {presets: ['edited']}, revision: 3}

let session
const claimants = []

beforeEach(() => {
    load$.mockReset()
    load$.mockReturnValue(of(PERSISTED))
    session = cacheOf()
})

// Claims are counted across the whole session, so a test's claimants let go before the next test claims.
afterEach(() => claimants.splice(0).forEach(claimant => claimant.release()))

describe('a refreshing read of a recipe nobody is editing', () => {
    it('reads past the cache, even when it holds that recipe', () => {
        session.records.set('source-1', DRAFT)

        const result = read(claimant().reload$('source-1'))

        expect(load$).toHaveBeenCalledWith('source-1')
        expect(result.model.presets).toEqual(['persisted'])
    })

    it('writes what it read into the cache', () => {
        read(claimant().reload$('source-1'))

        expect(session.records.get('source-1')).toMatchObject({id: 'source-1', model: {presets: ['persisted']}})
    })
})

// A copy read after the one now requested was sent is newer than its response.
describe('a refreshing read overtaken by a newer copy', () => {
    const NEWER = {...PERSISTED, model: {presets: ['newer']}, revision: 5}

    it('does not replace it, and hands the caller the newer copy', () => {
        session.records.set('source-1', NEWER)

        const result = read(claimant().reload$('source-1'))

        expect(session.records.get('source-1')).toBe(NEWER)
        expect(result).toBe(NEWER)
    })
})

// Between asking and the answer the user can open the recipe, and the draft they are now editing is not something a
// dependency read may overwrite - nor may the caller go on reading a version the session has moved past.
describe('a read of a recipe opened while it was in flight', () => {
    it.each([
        ['refreshing', claimant => claimant.reload$('source-1')],
        ['first', claimant => claimant.load$('source-1')]
    ])('does not write a %s read into the cache, and hands the caller the draft', (_case, request$) => {
        const answer = new Subject()
        load$.mockReturnValue(answer)
        let result
        request$(claimant()).subscribe(recipe => result = recipe)

        session.records.set('source-1', DRAFT)
        session.opened.add('source-1')
        answer.next(PERSISTED)

        expect(session.records.get('source-1')).toBe(DRAFT)
        expect(result).toBe(DRAFT)
    })

    it('hands back what it read when the session has no record after all', () => {
        session.opened.add('source-1')

        const result = read(claimant().reload$('source-1'))

        expect(result.id).toBe('source-1')
        expect(session.records.has('source-1')).toBe(false)
    })
})

// Closed while its saves are unsettled, the recipe still holds its edit (draftAgreement.js).
describe('a refreshing read of a closed recipe whose save has not settled', () => {
    it('does not replace the unsaved draft, and hands it to the caller', () => {
        session.records.set('source-1', DRAFT)
        session.saves['source-1'] = {status: 'SAVING', revision: 3, model: {presets: ['old']}}

        const result = read(claimant().reload$('source-1'))

        expect(session.records.get('source-1')).toBe(DRAFT)
        expect(result).toBe(DRAFT)
    })
})

describe('an ordinary read', () => {
    it('answers from the cache without reading at all', () => {
        session.records.set('source-1', DRAFT)

        const result = read(claimant().load$('source-1'))

        expect(load$).not.toHaveBeenCalled()
        expect(result).toBe(DRAFT)
    })
})

// An editor's components and the runtime's evidence watches claim the same entries: each keeps what it uses, and
// neither takes it from the other.
describe('an entry two claimants use', () => {
    it.each([
        ['the editor first', ([editor, watch]) => [editor, watch]],
        ['the evidence watch first', ([editor, watch]) => [watch, editor]]
    ])('stays until the last of them releases it, %s', (_case, order) => {
        const editor = claimant()
        const watch = claimant()
        read(editor.load$('source-1'))
        read(watch.load$('source-1'))
        const [first, last] = order([editor, watch])

        first.release()
        expect(session.records.has('source-1')).toBe(true)
        last.release()

        expect(session.records.has('source-1')).toBe(false)
    })

    it.each([
        ['the editor first', ([editor, watch]) => [editor, watch]],
        ['the evidence watch first', ([editor, watch]) => [watch, editor]]
    ])('keeps a closed draft whose save has not settled once both release it, %s, and no read replaces it', (_case, order) => {
        session.records.set('source-1', DRAFT)
        session.saves['source-1'] = {status: 'SAVING', revision: 3, model: {presets: ['old']}}
        const editor = claimant()
        const watch = claimant()
        editor.use('source-1')
        read(watch.reload$('source-1'))
        const [first, last] = order([editor, watch])

        first.release()
        last.release()

        expect(session.records.get('source-1')).toBe(DRAFT)
    })
})

// What is edited is not a cached copy of storage, and only the session holds it (draftAgreement.js).
describe('a draft its last claimant releases', () => {
    it.each([
        ['open', () => session.opened.add('source-1')],
        ['closed while its save is outstanding', () => session.saves['source-1'] = {status: 'SAVING', revision: 3}],
        ['closed after its save failed', () => session.saves['source-1'] = {status: 'FAILED', revision: 3}]
    ])('stays in the cache while %s', (_case, arrange) => {
        session.records.set('source-1', DRAFT)
        arrange()
        const editor = claimant()
        editor.use('source-1')

        editor.release()

        expect(session.records.get('source-1')).toBe(DRAFT)
    })

    it('is removed once its save has settled', () => {
        session.records.set('source-1', DRAFT)
        session.saves['source-1'] = {status: 'SAVED', revision: 3}
        const editor = claimant()
        editor.use('source-1')

        editor.release()

        expect(session.records.has('source-1')).toBe(false)
    })
})

describe('a response arriving after its claimant released', () => {
    it('does not recreate the entry', () => {
        const answer = new Subject()
        load$.mockReturnValue(answer)
        const watch = claimant()
        let result
        watch.load$('source-1').subscribe(recipe => result = recipe)

        watch.release()
        answer.next(PERSISTED)

        expect(session.records.has('source-1')).toBe(false)
        expect(result.id).toBe('source-1')
    })

    it('leaves an entry another claimant holds as it is', () => {
        const answer = new Subject()
        const editor = claimant()
        editor.use('source-1')
        session.records.set('source-1', DRAFT)
        load$.mockReturnValue(answer)
        const watch = claimant()
        watch.reload$('source-1').subscribe()

        watch.release()
        answer.next(PERSISTED)

        expect(session.records.get('source-1')).toBe(DRAFT)
    })
})

const claimant = () => {
    const created = new RecipeCacheClaimant(session)
    claimants.push(created)
    return created
}

const read = request$ => {
    let result
    request$.subscribe(recipe => result = recipe)
    return result
}

function cacheOf() {
    const records = new Map()
    const opened = new Set()
    const saves = {}
    return {
        records,
        opened,
        saves,
        held: id => records.get(id),
        open: id => opened.has(id),
        saveState: id => saves[id],
        write: record => records.set(record.id, record),
        remove: id => records.delete(id)
    }
}
