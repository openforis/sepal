import assert from 'node:assert/strict'
import {after, before, mock, test} from 'node:test'

import Router from '@koa/router'
import Koa from 'koa'
import bodyParser from 'koa-bodyparser'

import {callsOf} from '#sepal/testSupport/mock'

import {Unauthorized} from './errors.js'
import {createRoutes} from './routes.js'
import {createTasksApi} from './tasksApi.js'

const ALICE = JSON.stringify({username: 'alice', roles: []})
const ADMIN = JSON.stringify({username: 'sepal-gateway', roles: ['application_admin']})
const TASK_SESSION = JSON.stringify({workerType: 'task', taskId: 't-1'})
const GRANTED = new Date('2026-10-15T08:00:00.000Z')

const tasks = {
    submit: mock.fn(
        async ({username, operation, params}) => ({id: 't-1', username, operation, params, state: 'PENDING', statusDescription: '{}'})
    ),
    cancel: mock.fn(async () => {}),
    reportProgress: mock.fn(async ({taskId, callerTaskId}) => {
        if (taskId !== callerTaskId) {
            throw new Unauthorized('wrong key')
        }
    }),
    requestLocalProcessing: mock.fn(async ({taskId, callerTaskId}) => {
        if (taskId !== callerTaskId) {
            throw new Unauthorized('wrong key')
        }
        return GRANTED
    }),
    releaseLocalProcessing: mock.fn(async () => {}),
    removeFinished: mock.fn(async () => {}),
    authenticateApiKey: mock.fn(
        async apiKey => apiKey === 'task_k' ? {username: 'alice', taskId: 't-1'} : null
    )
}

let server
let url

before(async () => {
    const app = new Koa()
    const router = new Router()
    app.use(bodyParser())
    createRoutes(createTasksApi(tasks))(router)
    app.use(router.routes())
    server = app.listen(0)
    url = `http://127.0.0.1:${server.address().port}`
})

after(() => server.close())

test('a user submits a task as themselves', async () => {
    const body = {id: 't-1', operation: 'image.GEE', params: {title: 'Mosaic'}}

    const response = await post('/tasks', {user: ALICE, body})

    assert.equal(response.status, 200)
    assert.partialDeepStrictEqual(callsOf(tasks.submit), [[{id: body.id, username: 'alice', operation: body.operation}]])
})

test('a request without a user is refused', async () => {
    assert.equal((await post('/tasks', {body: {operation: 'image.GEE'}})).status, 401)
})

test('a container reports progress for its own task, with the slot it last released', async () => {
    const body = {statusDescription: {messageKey: 'k'}, releasedSlot: GRANTED.toISOString()}

    const response = await post('/tasks/task/t-1/progress', {user: ALICE, session: TASK_SESSION, body})

    assert.equal(response.status, 204)
    assert.deepEqual(
        callsOf(tasks.reportProgress),
        [[{taskId: 't-1', callerTaskId: 't-1', ...body}]]
    )
})

test('progress without a task session is refused', async () => {
    assert.equal(
        (await post('/tasks/task/t-1/progress', {user: ALICE, body: {statusDescription: {}}})).status,
        403
    )
})

test('progress sent with another task\'s key is refused', async () => {
    const response = await post('/tasks/task/t-2/progress', {user: ALICE, session: TASK_SESSION, body: {statusDescription: {}}})

    assert.equal(response.status, 403)
})

test('a container asks for a local processing slot for its own task', async () => {
    const response = await post('/tasks/task/t-1/local-processing', {user: ALICE, session: TASK_SESSION})

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {granted: true, slot: GRANTED.toISOString()})
    assert.deepEqual(
        callsOf(tasks.requestLocalProcessing),
        [[{taskId: 't-1', callerTaskId: 't-1'}]]
    )
})

test('a container told no slot is free is not granted one', async () => {
    tasks.requestLocalProcessing.mock.mockImplementationOnce(async () => null)

    const response = await post('/tasks/task/t-1/local-processing', {user: ALICE, session: TASK_SESSION})

    assert.deepEqual(await response.json(), {granted: false})
})

test('a local processing slot asked for with another task\'s key is refused', async () => {
    assert.equal(
        (await post('/tasks/task/t-2/local-processing', {user: ALICE, session: TASK_SESSION})).status,
        403
    )
})

test('a container gives its local processing slot back', async () => {
    const body = {slot: GRANTED.toISOString()}

    const response = await post('/tasks/task/t-1/local-processing/release', {user: ALICE, session: TASK_SESSION, body})

    assert.equal(response.status, 204)
    assert.deepEqual(
        callsOf(tasks.releaseLocalProcessing),
        [[{taskId: 't-1', callerTaskId: 't-1', slot: body.slot}]]
    )
})

test('local processing without a task session is refused', async () => {
    assert.equal(
        (await post('/tasks/task/t-1/local-processing', {user: ALICE})).status,
        403
    )
    assert.equal(
        (await post('/tasks/task/t-1/local-processing/release', {user: ALICE})).status,
        403
    )
})

test('a user removes the finished tasks they name', async () => {
    const response = await post('/tasks/remove', {user: ALICE, body: {taskIds: ['t-1', 't-2']}})

    assert.equal(response.status, 204)
    assert.deepEqual(
        callsOf(tasks.removeFinished),
        [[{taskIds: ['t-1', 't-2'], username: 'alice'}]]
    )
})

test('the gateway learns whose task a key belongs to', async () => {
    const known = await post('/tasks/api-key-authenticate', {user: ADMIN, body: {apiKey: 'task_k'}})
    const unknown = await post('/tasks/api-key-authenticate', {user: ADMIN, body: {apiKey: 'task_x'}})

    assert.equal(known.status, 200)
    assert.deepEqual(await known.json(), {username: 'alice', taskId: 't-1'})
    assert.equal(unknown.status, 401)
})

test('only an administrator may authenticate keys', async () => {
    assert.equal(
        (await post('/tasks/api-key-authenticate', {user: ALICE, body: {apiKey: 'task_k'}})).status,
        403
    )
})

const post = (path, {user, session, body} = {}) => fetch(`${url}${path}`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        ...(user && {'sepal-user': user}),
        ...(session && {'sepal-session': session})
    },
    body: JSON.stringify(body ?? {})
})
