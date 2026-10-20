import {describe, expect, it} from 'vitest'

import {listingAuthority, mergedListing, touchedListing} from './recipeListing'

// Merging a refreshed listing into the one this session holds. A refresh reports storage as it was when it was asked;
// whatever this session did with its listing after that must survive it.

describe('a refreshed listing', () => {
    it('keeps a recipe created here after the refresh started', () => {
        const {listingState, startedEpoch} = started({recipes: [entry('a', 4)]})
        const created = entry('new', 1)
        const local = {recipes: [entry('a', 4), created], listingState: touchedListing(listingState, ['new'])}

        const {recipes} = merged({...local, response: [entry('a', 4)], startedEpoch})

        expect(ids(recipes)).toEqual(['a', 'new'])
    })

    it('keeps a recipe deleted here after the refresh started deleted', () => {
        const {listingState, startedEpoch} = started({recipes: [entry('a', 4), entry('gone', 2)]})
        const local = {recipes: [entry('a', 4)], listingState: touchedListing(listingState, ['gone'])}

        const {recipes, listingState: after} = merged({...local, response: [entry('a', 4), entry('gone', 2)], startedEpoch})

        expect(ids(recipes)).toEqual(['a'])
        expect(after.withdrawn).toEqual([])
    })

    it('keeps a recipe whose save was acknowledged while it was asked for, which storage may not list yet', () => {
        const outstanding = {status: 'SAVING'}
        const {recipes} = merged({
            recipes: [entry('a', 4), entry('created', 1)],
            listingState: {checkedAt: 0, epoch: 1, touched: {created: 1}},
            savesAtStart: {created: outstanding},
            saves: {created: {status: 'SAVED', revision: 1}},
            response: [entry('a', 4)]
        })

        expect(ids(recipes)).toEqual(['a', 'created'])
    })

    it('keeps an entry\'s fields with its newest revision', () => {
        const {recipes} = merged({recipes: [{...entry('a', 6), name: 'new name'}], response: [{...entry('a', 5), name: 'old name'}]})

        expect(recipes).toEqual([{...entry('a', 6), name: 'new name'}])
    })

    it('never lowers a revision, whichever side learned of it first', () => {
        const {recipes} = merged({recipes: [entry('a', 6), entry('b', 2)], response: [entry('a', 5), entry('b', 3)]})

        expect(recipes.map(({revision}) => revision)).toEqual([6, 3])
    })

    it('takes what storage says of an entry, keeping what only this session set on it', () => {
        const {recipes} = merged({
            recipes: [{...entry('a', 4), name: 'old', selected: true}],
            response: [{...entry('a', 4), name: 'renamed'}]
        })

        expect(recipes).toEqual([{...entry('a', 4), name: 'renamed', selected: true}])
    })

    it('keeps a recipe whose save is still outstanding, which storage may not list yet', () => {
        const {recipes} = merged({
            recipes: [entry('a', 4), entry('saving', undefined)],
            saves: {saving: {status: 'SAVING'}},
            response: [entry('a', 4)]
        })

        expect(ids(recipes)).toEqual(['a', 'saving'])
    })

    // Unlisted is not deleted: a dependency that disappears is read again to establish whether it is still there.
    it('reports a recipe it stops listing as withdrawn, until it is listed again', () => {
        const withdrawn = merged({recipes: [entry('a', 4), entry('b', 2)], response: [entry('a', 4)]})
        const relisted = merged({...withdrawn, response: [entry('a', 4), entry('b', 2)]})

        expect(ids(withdrawn.recipes)).toEqual(['a'])
        expect(withdrawn.listingState.withdrawn).toEqual(['b'])
        expect(relisted.listingState.withdrawn).toEqual([])
    })

    // The evidence dates from when it was asked for.
    it('is as old as its request, however late its response arrives', () => {
        const {listingState} = merged({
            recipes: [], listingState: {checkedAt: 0}, response: [], startedAt: 1000, now: 1000 + 301000
        })

        expect(listingState).toMatchObject({checkedAt: 1000, expired: true})
    })

    it('cannot make evidence older than what a later check already established', () => {
        const {listingState} = merged({recipes: [], listingState: {checkedAt: 5000}, response: [], startedAt: 1000, now: 6000})

        expect(listingState.checkedAt).toBe(5000)
    })
})

// A refresh, a move and a project removal can each be in flight at once, and answer in any order.
describe('a listing whose request started before one already merged', () => {
    it('does not bring back a recipe deleted here, after a later listing has settled', () => {
        const deleted = {recipes: [entry('a', 4)], listingState: {checkedAt: 0, epoch: 1, touched: {gone: 1}}}
        const moved = merged({...deleted, response: [entry('a', 4)], startedEpoch: 1, startedAt: 200, now: 250})
        const afterMove = {...moved, listingState: touchedListing(moved.listingState, ['a'])}

        const refreshed = merged({...afterMove, response: [entry('a', 4), entry('gone', 2)], startedEpoch: 0, startedAt: 100})

        expect(ids(refreshed.recipes)).toEqual(['a'])
    })

    it('neither adds nor drops recipes, but brings entries up to newer revisions', () => {
        const {recipes, listingState} = merged({
            recipes: [entry('a', 4), entry('b', 2)],
            listingState: {checkedAt: 500, epoch: 0, withdrawn: ['c']},
            response: [entry('a', 5), entry('c', 1), entry('elsewhere', 1)],
            startedAt: 100
        })

        expect(recipes).toEqual([entry('a', 5), entry('b', 2)])
        expect(listingState).toMatchObject({checkedAt: 500, withdrawn: ['c']})
    })
})

describe('the listing as Retrieve\'s authority', () => {
    it.each([
        ['current while younger than five minutes', {checkedAt: 0}, 299999, 'CURRENT'],
        ['expired from five minutes', {checkedAt: 0}, 300000, 'EXPIRED'],
        ['expired once the lapse was published, whatever the clock says', {checkedAt: 0, expired: true}, 1000, 'EXPIRED'],
        ['unavailable once expired after a failed refresh', {checkedAt: 0, failure: {message: 'x'}}, 300000, 'UNAVAILABLE'],
        ['waiting for a first listing still loading', {refreshing: true}, 0, 'WAITING'],
        ['unavailable with no listing at all', {}, 0, 'UNAVAILABLE']
    ])('is %s', (_case, listingState, now, expected) => {
        expect(listingAuthority({listingState, now})).toBe(expected)
    })
})

const entry = (id, revision) => ({id, name: id, type: 'MOSAIC', revision})

const ids = recipes => recipes.map(({id}) => id)

// A listing whose refresh starts now, at the session's current epoch.
const started = ({recipes}) => {
    const listingState = {checkedAt: 0, epoch: 3}
    return {recipes, listingState, startedEpoch: listingState.epoch}
}

const merged = ({
    recipes, listingState = {checkedAt: 0, epoch: 0}, saves = {}, savesAtStart = saves, response, startedEpoch,
    startedAt = 100, now = 200
}) =>
    mergedListing({
        recipes, listingState, saves, savesAtStart, response, startedAt, now,
        startedEpoch: startedEpoch ?? listingState.epoch ?? 0
    })
