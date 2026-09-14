// Tests for the outbound WorkerGateway (HTTP client to the task-executor). fetch is mocked — no
// real task-executor is contacted.

import {jest} from '@jest/globals'

import {createWorkerGateway} from './workerGateway.js'

const session = {host: 'worker-host'}

describe('createWorkerGateway.execute', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    test('POSTs a form-encoded task to http://<host>:8080/api/tasks', async () => {
        const fetchMock = jest.fn().mockResolvedValue({ok: true, text: async () => ''})
        global.fetch = fetchMock
        const gateway = createWorkerGateway()

        const params = JSON.stringify({sceneIds: ['a', 'b']})
        await gateway.execute(
            {id: 'task-1', recipeId: 'recipe-1', operation: 'landsat-scene-download', params},
            session
        )

        expect(fetchMock).toHaveBeenCalledTimes(1)
        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe('http://worker-host:8080/api/tasks')
        expect(init.method).toBe('POST')
        expect(init.headers['Accept']).toMatch(/application\/json/)
        expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded')

        // Body is a URLSearchParams (form-encoded); parse it back and verify fields.
        const form = new URLSearchParams(init.body.toString())
        expect(form.get('id')).toBe('task-1')
        expect(form.get('recipeId')).toBe('recipe-1')
        expect(form.get('operation')).toBe('landsat-scene-download')
        // params passed through as the JSON string, verbatim.
        expect(form.get('params')).toBe(params)
    })

    test('honors a custom workerPort', async () => {
        const fetchMock = jest.fn().mockResolvedValue({ok: true, text: async () => ''})
        global.fetch = fetchMock
        const gateway = createWorkerGateway({workerPort: 9090})

        await gateway.execute({id: 't', operation: 'op', params: '{}'}, session)

        expect(fetchMock.mock.calls[0][0]).toBe('http://worker-host:9090/api/tasks')
    })

    test('omits null recipeId from the form body', async () => {
        const fetchMock = jest.fn().mockResolvedValue({ok: true, text: async () => ''})
        global.fetch = fetchMock
        const gateway = createWorkerGateway()

        await gateway.execute({id: 't', recipeId: null, operation: 'op', params: '{}'}, session)

        const form = new URLSearchParams(fetchMock.mock.calls[0][1].body.toString())
        expect(form.has('recipeId')).toBe(false)
    })

    test('throws on a non-2xx response', async () => {
        global.fetch = jest.fn().mockResolvedValue({ok: false, status: 503, text: async () => 'down'})
        const gateway = createWorkerGateway()
        await expect(
            gateway.execute({id: 't', operation: 'op', params: '{}'}, session)
        ).rejects.toThrow(/t.*503/)
    })
})

describe('createWorkerGateway.cancel', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    test('DELETEs http://<host>:8080/api/tasks/<taskId>', async () => {
        const fetchMock = jest.fn().mockResolvedValue({ok: true, text: async () => ''})
        global.fetch = fetchMock
        const gateway = createWorkerGateway()

        await gateway.cancel('task-1', session)

        expect(fetchMock).toHaveBeenCalledTimes(1)
        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe('http://worker-host:8080/api/tasks/task-1')
        expect(init.method).toBe('DELETE')
    })

    test('throws on a non-2xx response', async () => {
        global.fetch = jest.fn().mockResolvedValue({ok: false, status: 404, text: async () => 'gone'})
        const gateway = createWorkerGateway()
        await expect(gateway.cancel('task-1', session)).rejects.toThrow(/task-1.*404/)
    })
})

describe('credentials', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    test('neither request carries any authorization', async () => {
        const fetchMock = jest.fn().mockResolvedValue({ok: true, text: async () => ''})
        global.fetch = fetchMock
        const gateway = createWorkerGateway()

        await gateway.execute({id: 't', operation: 'op', params: '{}'}, session)
        await gateway.cancel('t', session)

        expect(fetchMock).toHaveBeenCalledTimes(2)
        for (const [, init] of fetchMock.mock.calls) {
            expect(Object.keys(init.headers).map(name => name.toLowerCase()))
                .not.toContain('authorization')
        }
    })
})
