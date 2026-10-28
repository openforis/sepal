import assert from 'node:assert/strict'
import {describe, test} from 'node:test'

import {defer, Subject} from 'rxjs'

import {LimiterService} from './limiter.js'

describe('a tiered limiter', () => {
    test('holds a call while its project is at capacity, even though its user has room', async () => {
        const limiter$ = projectLimited()

        const alice = start(limiter$, {username: 'alice', projectId: 'shared-project'})
        const bob = start(limiter$, {username: 'bob', projectId: 'shared-project'})
        const carol = start(limiter$, {username: 'carol', projectId: 'carols-project'})
        await settle()

        assert.deepEqual(started(alice, bob, carol), [true, false, true])
    })

    test('holds a call while its user is at capacity, even though its project has room', async () => {
        const limiter$ = projectLimited({userConcurrency: 1})

        const alicesFirst = start(limiter$, {username: 'alice', projectId: 'project-a'})
        const alicesSecond = start(limiter$, {username: 'alice', projectId: 'project-b'})
        const bob = start(limiter$, {username: 'bob', projectId: 'project-b'})
        await settle()

        assert.deepEqual(started(alicesFirst, alicesSecond, bob), [true, false, true])
    })

    test('starts a held call once the call ahead of it ends', async () => {
        const limiter$ = projectLimited()
        const alice = start(limiter$, {username: 'alice', projectId: 'shared-project'})
        const bob = start(limiter$, {username: 'bob', projectId: 'shared-project'})
        await settle()

        alice.end()
        await settle()

        assert.deepEqual(started(bob), [true])
    })

    test('a held call that is abandoned leaves the capacity to the next one', async () => {
        const limiter$ = projectLimited()
        const alice = start(limiter$, {username: 'alice', projectId: 'shared-project'})
        const bob = start(limiter$, {username: 'bob', projectId: 'shared-project'})
        const dave = start(limiter$, {username: 'dave', projectId: 'shared-project'})
        await settle()

        bob.abandon()
        alice.end()
        await settle()

        assert.deepEqual(started(bob, dave), [false, true])
    })

    test('a call that fails gives its capacity back', async () => {
        const limiter$ = projectLimited()
        const alice = start(limiter$, {username: 'alice', projectId: 'shared-project'})
        const bob = start(limiter$, {username: 'bob', projectId: 'shared-project'})
        await settle()

        alice.fail()
        await settle()

        assert.deepEqual(started(bob), [true])
    })
})

describe('an untiered limiter', () => {
    test('limits each user under a global limit, for callers naming only a user', async () => {
        const {limiter$} = LimiterService(uniqueName(), {
            maxConcurrency: 2,
            idleMs: IDLE_MS,
            global: {maxConcurrency: 1, idleMs: IDLE_MS}
        })

        const alice = start(limiter$, 'alice')
        const bob = start(limiter$, 'bob')
        await settle()
        assert.deepEqual(started(alice, bob), [true, false])

        alice.end()
        await settle()
        assert.deepEqual(started(bob), [true])
    })
})

const IDLE_MS = 50

let limiterCount = 0

// Each limiter registers metrics under its name, and a name can be registered once per process.
const uniqueName = () => `TestLimiter${++limiterCount}`

const projectLimited = ({userConcurrency = 5} = {}) =>
    LimiterService(uniqueName(), {
        tiers: [
            {name: 'user', key: ({username}) => username, limits: () => ({maxConcurrency: userConcurrency, idleMs: IDLE_MS})},
            {name: 'project', key: ({projectId}) => projectId, limits: () => ({maxConcurrency: 1, idleMs: IDLE_MS})}
        ]
    }).limiter$

const start = (limiter$, request) => {
    const end$ = new Subject()
    const call = {started: false}
    const subscription = limiter$(
        defer(() => {
            call.started = true
            return end$
        }),
        undefined,
        request
    ).subscribe({error: () => {}})
    call.end = () => end$.complete()
    call.fail = () => end$.error(new Error('failed'))
    call.abandon = () => subscription.unsubscribe()
    return call
}

const started = (...calls) => calls.map(call => call.started)

const settle = () => new Promise(resolve => setTimeout(resolve, 20))
