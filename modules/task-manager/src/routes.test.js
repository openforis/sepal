import {jest} from '@jest/globals'
import Router from '@koa/router'
import Koa from 'koa'
import bodyParser from 'koa-bodyparser'

import {Unauthorized} from './errors.js'
import {createRoutes} from './routes.js'
import {createTasksApi} from './tasksApi.js'

const ALICE = JSON.stringify({username: 'alice', roles: []})
const ADMIN = JSON.stringify({username: 'sepal-gateway', roles: ['application_admin']})
const TASK_SESSION = JSON.stringify({workerType: 'task', taskId: 't-1'})

const tasks = {
    submit: jest.fn(async ({username, operation, params}) => ({id: 't-1', username, operation, params, state: 'PENDING', statusDescription: '{}'})),
    cancel: jest.fn(async () => {}),
    reportProgress: jest.fn(async ({taskId, callerTaskId}) => {
        if (taskId !== callerTaskId) {
            throw new Unauthorized('wrong key')
        }
    }),
    requestLocalProcessing: jest.fn(async ({taskId, callerTaskId}) => {
        if (taskId !== callerTaskId) {
            throw new Unauthorized('wrong key')
        }
        return true
    }),
    releaseLocalProcessing: jest.fn(async () => {}),
    authenticateApiKey: jest.fn(async apiKey => apiKey === 'task_k' ? {username: 'alice', taskId: 't-1'} : null)
}

let server
let url

beforeAll(async () => {
    const app = new Koa()
    const router = new Router()
    app.use(bodyParser())
    createRoutes(createTasksApi(tasks))(router)
    app.use(router.routes())
    server = app.listen(0)
    url = `http://127.0.0.1:${server.address().port}`
})

afterAll(() => server.close())

test('a user submits a task as themselves', async () => {
    const response = await post('/tasks', {user: ALICE, body: {operation: 'image.GEE', params: {title: 'Mosaic'}}})

    expect(response.status).toBe(200)
    expect(tasks.submit).toHaveBeenCalledWith(expect.objectContaining({username: 'alice', operation: 'image.GEE'}))
})

test('a request without a user is refused', async () => {
    expect((await post('/tasks', {body: {operation: 'image.GEE'}})).status).toBe(401)
})

test('a container reports progress for its own task', async () => {
    const response = await post('/tasks/task/t-1/progress', {user: ALICE, session: TASK_SESSION, body: {statusDescription: {messageKey: 'k'}}})

    expect(response.status).toBe(204)
})

test('progress without a task session is refused', async () => {
    expect((await post('/tasks/task/t-1/progress', {user: ALICE, body: {statusDescription: {}}})).status).toBe(403)
})

test('progress sent with another task\'s key is refused', async () => {
    const response = await post('/tasks/task/t-2/progress', {user: ALICE, session: TASK_SESSION, body: {statusDescription: {}}})

    expect(response.status).toBe(403)
})

test('a container asks for a local processing slot for its own task', async () => {
    const response = await post('/tasks/task/t-1/local-processing', {user: ALICE, session: TASK_SESSION})

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({granted: true})
    expect(tasks.requestLocalProcessing).toHaveBeenCalledWith({taskId: 't-1', callerTaskId: 't-1'})
})

test('a local processing slot asked for with another task\'s key is refused', async () => {
    expect((await post('/tasks/task/t-2/local-processing', {user: ALICE, session: TASK_SESSION})).status).toBe(403)
})

test('a container gives its local processing slot back', async () => {
    const response = await post('/tasks/task/t-1/local-processing/release', {user: ALICE, session: TASK_SESSION})

    expect(response.status).toBe(204)
    expect(tasks.releaseLocalProcessing).toHaveBeenCalledWith({taskId: 't-1', callerTaskId: 't-1'})
})

test('local processing without a task session is refused', async () => {
    expect((await post('/tasks/task/t-1/local-processing', {user: ALICE})).status).toBe(403)
    expect((await post('/tasks/task/t-1/local-processing/release', {user: ALICE})).status).toBe(403)
})

test('the gateway learns whose task a key belongs to', async () => {
    const known = await post('/tasks/api-key-authenticate', {user: ADMIN, body: {apiKey: 'task_k'}})
    const unknown = await post('/tasks/api-key-authenticate', {user: ADMIN, body: {apiKey: 'task_x'}})

    expect(known.status).toBe(200)
    expect(await known.json()).toEqual({username: 'alice', taskId: 't-1'})
    expect(unknown.status).toBe(401)
})

test('only an administrator may authenticate keys', async () => {
    expect((await post('/tasks/api-key-authenticate', {user: ALICE, body: {apiKey: 'task_k'}})).status).toBe(403)
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
