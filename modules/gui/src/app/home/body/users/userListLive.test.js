import {describe, expect, it} from 'vitest'

import {conflictingRecord, createUserWsHandler, newerRows, withoutStale, withPending, withRows} from './userListLive'

describe('user ws handler', () => {
    it('applies a pushed user', () => {
        const {handler, applied} = connect()
        const bob = {username: 'bob', status: 'LOCKED'}

        handler({data: {user: bob}})

        expect(applied).toEqual([bob])
    })

    it('reloads the list when the module comes back after a lost connection', () => {
        const {handler, reloads} = connect()
        handler({ready: true})

        handler({ready: false})
        handler({ready: true})

        expect(reloads()).toBe(1)
    })

    it('does not reload on the initial ready', () => {
        const {handler, reloads} = connect()

        handler({ready: false})
        handler({ready: true})

        expect(reloads()).toBe(0)
    })
})

describe('newerRows', () => {
    it('keeps the rows whose revision is past the shown one, and unknown users', () => {
        const shown = [{username: 'bob', revision: 2}, {username: 'carol', revision: 5}]
        const rows = [{username: 'bob', revision: 3}, {username: 'carol', revision: 5}, {username: 'dave', revision: 1}]

        expect(newerRows(shown, rows)).toEqual([{username: 'bob', revision: 3}, {username: 'dave', revision: 1}])
    })

    it('drops the echo of a change the list already shows', () => {
        const shown = [{username: 'bob', revision: 3}]

        expect(newerRows(shown, [{username: 'bob', revision: 3}])).toEqual([])
    })
})

describe('withPending', () => {
    it('holds the given rows, latest per user', () => {
        const pending = withPending({bob: {username: 'bob', revision: 2}}, [{username: 'bob', revision: 3}, {username: 'carol', revision: 1}])

        expect(pending).toEqual({bob: {username: 'bob', revision: 3}, carol: {username: 'carol', revision: 1}})
    })
})

describe('withoutStale', () => {
    it('drops the pending rows the written ones have caught up with', () => {
        const pending = {bob: {username: 'bob', revision: 3}, carol: {username: 'carol', revision: 9}}

        const remaining = withoutStale(pending, [{username: 'bob', revision: 3}, {username: 'carol', revision: 8}])

        expect(remaining).toEqual({carol: {username: 'carol', revision: 9}})
    })
})

describe('withRows', () => {
    it('replaces known users in place and appends unknown ones', () => {
        const users = [{username: 'bob', name: 'Bob'}, {username: 'carol', name: 'Carol'}]

        const updated = withRows(users, [{username: 'carol', name: 'Caroline'}, {username: 'dave', name: 'Dave'}])

        expect(updated).toEqual([{username: 'bob', name: 'Bob'}, {username: 'carol', name: 'Caroline'}, {username: 'dave', name: 'Dave'}])
    })

    it('keeps the untouched rows as they were', () => {
        const bob = {username: 'bob', name: 'Bob'}

        const [first] = withRows([bob], [{username: 'carol'}])

        expect(first).toBe(bob)
    })
})

describe('conflictingRecord', () => {
    it('is the current record a rejected save came back with', () => {
        const bob = {username: 'bob', revision: 4}

        expect(conflictingRecord({status: 409, response: {message: 'changed', user: bob}})).toEqual(bob)
    })

    it('is nothing for any other failure', () => {
        expect(conflictingRecord({status: 500, response: {message: 'boom'}})).toBeUndefined()
        expect(conflictingRecord(new Error('network'))).toBeUndefined()
    })
})

const connect = () => {
    const applied = []
    let reloadCount = 0
    const handler = createUserWsHandler({
        onUser: user => applied.push(user),
        onReconnect: () => reloadCount++
    })
    return {handler, applied, reloads: () => reloadCount}
}
