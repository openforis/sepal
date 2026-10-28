import assert from 'node:assert/strict'
import {describe, test} from 'node:test'

import {requireTaskSession} from '#gee/taskSession'

const ALICE = JSON.stringify({username: 'alice', roles: []})
const TASK_SESSION = JSON.stringify({workerType: 'task', taskId: 't-1'})
const SANDBOX_SESSION = JSON.stringify({workerType: 'sandbox', sessionId: 's-1'})

describe('a task endpoint', () => {
    test('serves a request authenticated with a task container\'s key', async () => {
        const ctx = request({session: TASK_SESSION})

        await requireTaskSession(ctx, endpoint(ctx))

        assert.deepEqual(ctx.body, {exported: true})
    })

    test('refuses a user calling it directly', async () => {
        const ctx = request({})

        await requireTaskSession(ctx, endpoint(ctx))

        assertRefused(ctx)
    })

    test('refuses a sandbox session\'s key', async () => {
        const ctx = request({session: SANDBOX_SESSION})

        await requireTaskSession(ctx, endpoint(ctx))

        assertRefused(ctx)
    })

    test('refuses a task session that names no task', async () => {
        const ctx = request({session: JSON.stringify({workerType: 'task'})})

        await requireTaskSession(ctx, endpoint(ctx))

        assertRefused(ctx)
    })

    test('refuses an unreadable session', async () => {
        const ctx = request({session: '{not json'})

        await requireTaskSession(ctx, endpoint(ctx))

        assertRefused(ctx)
    })
})

const request = ({session}) => ({
    headers: {
        'sepal-user': ALICE,
        ...(session ? {'sepal-session': session} : {})
    }
})

const endpoint = ctx => async () => {
    ctx.body = {exported: true}
}

const assertRefused = ctx => {
    assert.equal(ctx.status, 403)
    assert.notDeepEqual(ctx.body, {exported: true})
}
