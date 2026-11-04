import assert from 'node:assert/strict'
import {describe, test} from 'node:test'

import {hashApiKey} from './apiKey.js'
import {InvalidCommand, NotFound, Unauthorized} from './errors.js'
import {State} from './task.js'
import {Tasks} from './tasks.js'
import {InMemoryRepository} from './testSupport/inMemoryRepository.js'

const GRANTED = new Date('2026-10-15T08:00:00.000Z')
const EXPRESSION = {result: '0', values: {'0': {constantValue: 1}}}
const TASK_ID = '3f2b8c1e-6d4a-4f7e-9b2c-1a5d8e7f6c3b'

describe('submitting', () => {
    test('stores a pending task for the user and asks for it to be launched', async () => {
        const {tasks, supervisor} = setup()

        const task = await tasks.submit({username: 'alice', operation: 'image.GEE', params: {title: 'Mosaic'}, recipeId: 'r-1'})

        assert.partialDeepStrictEqual(
            task,
            {username: 'alice', operation: 'image.GEE', state: State.PENDING, recipeId: 'r-1'}
        )
        assert.equal(supervisor.dispatched, 1)
    })

    test('accepts params sent as a JSON string', async () => {
        const {tasks} = setup()

        const task = await tasks.submit({username: 'alice', operation: 'image.GEE', params: JSON.stringify({title: 'Mosaic'})})

        assert.deepEqual(task.params, {title: 'Mosaic'})
    })

    test('refuses a task without an operation', async () => {
        await assert.rejects(setup().tasks.submit({username: 'alice', params: {}}), InvalidCommand)
    })

    for (const kind of ['IMAGE', 'TABLE']) {
        for (const workspacePath of [undefined, '', 'module_results/my export']) {
            test(`stores the actual ${kind} workspace destination for path ${JSON.stringify(workspacePath)}`, async () => {
                const {tasks, repository} = setup()
                const origin = {type: 'NOTEBOOK', path: 'analysis.ipynb'}
                const params = {
                    description: 'my export',
                    export: {kind, destination: 'SEPAL', expression: EXPRESSION, workspacePath, filenamePrefix: 'output'},
                    taskInfo: {kind, destination: 'SEPAL', outputPath: 'output', source: 'pysepal-api', origin}
                }

                const task = await tasks.submit({username: 'alice', operation: 'ee.export', params})
                const stored = await repository.getTask(task.id)
                const expectedPath = workspacePath || 'downloads/my_export'

                assert.equal(stored.params.export.workspacePath, expectedPath)
                assert.equal(stored.params.taskInfo.outputPath, expectedPath)
                assert.deepEqual(stored.params.taskInfo.origin, origin)
                assert.equal(stored.params.export.filenamePrefix, 'output')
                assert.equal(params.taskInfo.outputPath, 'output')
            })
        }
    }

    test('normalizes workspace exports received as JSON without task metadata', async () => {
        const {tasks} = setup()
        const task = await tasks.submit({username: 'alice', operation: 'ee.export', params: JSON.stringify({
            description: '../my export', export: {kind: 'IMAGE', destination: 'SEPAL', expression: EXPRESSION}
        })})

        assert.equal(task.params.export.workspacePath, 'downloads/_my_export')
        assert.deepEqual(task.params.taskInfo, {
            kind: 'IMAGE', destination: 'SEPAL', outputPath: 'downloads/_my_export', filenamePrefix: '_my_export'
        })
    })

    test('stores the Drive folder an export lands in', async () => {
        const {tasks, repository} = setup()
        const params = {
            description: 'plots',
            export: {kind: 'TABLE', destination: 'DRIVE', expression: EXPRESSION, driveFolder: 'exports/tables'},
            taskInfo: {kind: 'TABLE', destination: 'DRIVE', outputPath: 'exports/tables', source: 'pysepal-api'}
        }

        const task = await tasks.submit({username: 'alice', operation: 'ee.export', params})
        const stored = await repository.getTask(task.id)

        assert.equal(stored.params.export.driveFolder, 'exports_tables')
        assert.equal(stored.params.taskInfo.outputPath, 'exports_tables')
    })

    test('refuses an export the task could not run, saying why, without storing a task', async () => {
        const {tasks, repository} = setup()
        const params = {description: 'plots', export: {kind: 'TABLE', destination: 'SEPAL', expression: EXPRESSION, fileFormat: 'TIFF'}}

        await assert.rejects(
            tasks.submit({username: 'alice', operation: 'ee.export', params}),
            error => error instanceof InvalidCommand && /Unsupported table export fileFormat: TIFF/.test(error.message)
        )

        assert.deepEqual(await repository.userTasks('alice'), [])
    })

    for (const [operation, writerParams] of [
        ['ee.export', () => workspaceExport({workspacePath: 'module_results/demo'})],
        ['image.SEPAL', () => ({taskInfo: {recipeType: 'MOSAIC', destination: 'SEPAL', outputPath: 'module_results/demo'}})]
    ]) {
        test(`refuses a workspace export into the folder of an unfinished ${operation} task`, async () => {
            const {tasks} = setup()
            await tasks.submit({username: 'alice', operation, params: writerParams()})

            await assert.rejects(
                tasks.submit({username: 'alice', operation: 'ee.export', params: workspaceExport({workspacePath: '~/module_results/demo'})}),
                error => error instanceof InvalidCommand && error.message === 'A task is already exporting into ~/module_results/demo'
            )
        })
    }

    test('accepts a workspace export into the folder of a finished task', async () => {
        const {tasks, repository} = setup()
        const earlier = await tasks.submit({username: 'alice', operation: 'ee.export', params: workspaceExport({workspacePath: 'module_results/demo'})})
        await repository.transition(earlier, {from: [State.PENDING], to: State.COMPLETED})

        const task = await tasks.submit({username: 'alice', operation: 'ee.export', params: workspaceExport({workspacePath: 'module_results/demo'})})

        assert.equal(task.state, State.PENDING)
    })

    test('accepts a workspace export into a folder another user\'s task is writing to', async () => {
        const {tasks} = setup()
        await tasks.submit({username: 'bob', operation: 'ee.export', params: workspaceExport({workspacePath: 'module_results/demo'})})

        const task = await tasks.submit({username: 'alice', operation: 'ee.export', params: workspaceExport({workspacePath: 'module_results/demo'})})

        assert.equal(task.state, State.PENDING)
    })

    test('returns the task already created when a workspace export is submitted again under its id', async () => {
        const {tasks} = setup()
        const params = workspaceExport({workspacePath: 'module_results/demo'})
        const task = await tasks.submit({id: TASK_ID, username: 'alice', operation: 'ee.export', params})

        assert.equal((await tasks.submit({id: TASK_ID, username: 'alice', operation: 'ee.export', params})).id, task.id)
    })

    test('stores the params of other operations as sent', async () => {
        const {tasks} = setup()
        const params = {description: 'ndvi', export: {destination: 'SEPAL'}, taskInfo: {outputPath: 'original'}}

        const task = await tasks.submit({username: 'alice', operation: 'image.SEPAL', params})

        assert.deepEqual(task.params, params)
    })

    test('stores a task under the id the client named', async () => {
        const {tasks} = setup()

        const task = await tasks.submit({id: TASK_ID, username: 'alice', operation: 'image.GEE'})

        assert.equal(task.id, TASK_ID)
    })

    test('a repeated submission returns the task it already created, without storing another', async () => {
        const {tasks, repository} = setup()
        const submission = {id: TASK_ID, username: 'alice', operation: 'image.GEE'}
        const task = await tasks.submit(submission)

        const repeated = await tasks.submit(submission)

        assert.deepEqual(repeated, await repository.getTask(task.id))
        assert.deepEqual((await repository.userTasks('alice')).map(({id}) => id), [task.id])
    })

    test('refuses an id that another user\'s task has', async () => {
        const {tasks} = setup()
        await tasks.submit({id: TASK_ID, username: 'alice', operation: 'image.GEE'})

        await assert.rejects(tasks.submit({id: TASK_ID, username: 'bob', operation: 'image.GEE'}), Unauthorized)
    })

    test('refuses an id that is not a UUID', async () => {
        await assert.rejects(
            setup().tasks.submit({id: '../alice', username: 'alice', operation: 'image.GEE'}),
            InvalidCommand
        )
    })
})

describe('cancelling', () => {
    test('a pending task is canceled at once', async () => {
        const {tasks, repository} = setup()
        const task = await tasks.submit({username: 'alice', operation: 'image.GEE'})

        await tasks.cancel({taskId: task.id, username: 'alice'})

        assert.equal((await repository.getTask(task.id)).state, State.CANCELED)
    })

    test('a running task is marked canceling and its container is stopped', async () => {
        const {tasks, repository, supervisor} = setup()
        const task = await tasks.submit({username: 'alice', operation: 'image.GEE'})
        await repository.activate(task, hashApiKey('task_k'))

        await tasks.cancel({taskId: task.id, username: 'alice'})

        assert.equal((await repository.getTask(task.id)).state, State.CANCELING)
        assert.deepEqual(supervisor.stopped, [task.id])
    })

    test('another user\'s task cannot be cancelled', async () => {
        const {tasks} = setup()
        const task = await tasks.submit({username: 'alice', operation: 'image.GEE'})

        await assert.rejects(tasks.cancel({taskId: task.id, username: 'bob'}), Unauthorized)
    })
})

describe('progress from a container', () => {
    test('is recorded for the task whose key sent it', async () => {
        const {tasks, repository} = setup()
        const task = await tasks.submit({username: 'alice', operation: 'image.GEE'})
        await repository.activate(task, hashApiKey('task_k'))
        const statusDescription = {messageKey: 'tasks.ee.export.running', defaultMessage: 'Exporting'}

        await tasks.reportProgress({taskId: task.id, callerTaskId: task.id, statusDescription})

        assert.deepEqual(
            JSON.parse((await repository.getTask(task.id)).statusDescription),
            statusDescription
        )
    })

    test('naming the slot the container last released releases that grant', async () => {
        const {tasks, repository, supervisor} = setup()
        const task = await tasks.submit({username: 'alice', operation: 'image.SEPAL'})
        await repository.activate(task, hashApiKey('task_k'))

        await tasks.reportProgress({taskId: task.id, callerTaskId: task.id, statusDescription: {}, releasedSlot: GRANTED.toISOString()})

        assert.deepEqual(supervisor.slotReleases, [[task.id, GRANTED]])
    })

    test('without a released slot, releases nothing', async () => {
        const {tasks, repository, supervisor} = setup()
        const task = await tasks.submit({username: 'alice', operation: 'image.SEPAL'})
        await repository.activate(task, hashApiKey('task_k'))

        await tasks.reportProgress({taskId: task.id, callerTaskId: task.id, statusDescription: {}})

        assert.deepEqual(supervisor.slotReleases, [])
    })

    test('progress from a different task\'s key is refused', async () => {
        const {tasks} = setup()
        const task = await tasks.submit({username: 'alice', operation: 'image.GEE'})

        await assert.rejects(
            tasks.reportProgress({taskId: task.id, callerTaskId: 'other', statusDescription: {}}),
            Unauthorized
        )
    })
})

describe('local processing from a container', () => {
    test('a slot is asked for and given back for the task whose key calls', async () => {
        const {tasks, supervisor} = setup()
        const task = await tasks.submit({username: 'alice', operation: 'image.SEPAL'})

        const slot = await tasks.requestLocalProcessing({taskId: task.id, callerTaskId: task.id})
        await tasks.releaseLocalProcessing({taskId: task.id, callerTaskId: task.id, slot: slot.toISOString()})

        assert.deepEqual(slot, GRANTED)
        assert.deepEqual(supervisor.slotRequests, [task.id])
        assert.deepEqual(supervisor.slotReleases, [[task.id, GRANTED]])
    })

    test('a release that does not name a valid grant is refused', async () => {
        const {tasks, supervisor} = setup()
        const task = await tasks.submit({username: 'alice', operation: 'image.SEPAL'})

        await assert.rejects(
            tasks.releaseLocalProcessing({taskId: task.id, callerTaskId: task.id}),
            InvalidCommand
        )
        await assert.rejects(
            tasks.releaseLocalProcessing({taskId: task.id, callerTaskId: task.id, slot: 'soon'}),
            InvalidCommand
        )
        assert.deepEqual(supervisor.slotReleases, [])
    })

    test('a call with a different task\'s key is refused', async () => {
        const {tasks, supervisor} = setup()
        const task = await tasks.submit({username: 'alice', operation: 'image.SEPAL'})

        await assert.rejects(
            tasks.requestLocalProcessing({taskId: task.id, callerTaskId: 'other'}),
            Unauthorized
        )
        await assert.rejects(
            tasks.releaseLocalProcessing({taskId: task.id, callerTaskId: 'other', slot: GRANTED.toISOString()}),
            Unauthorized
        )
        assert.deepEqual(supervisor.slotRequests, [])
        assert.deepEqual(supervisor.slotReleases, [])
    })

    test('a call for a task that does not exist is not found', async () => {
        const {tasks} = setup()

        await assert.rejects(
            tasks.requestLocalProcessing({taskId: 'gone', callerTaskId: 'gone'}),
            NotFound
        )
    })
})

describe('authenticating a container\'s key', () => {
    test('names the user and task of a running task\'s key', async () => {
        const {tasks, repository} = setup()
        const task = await tasks.submit({username: 'alice', operation: 'image.GEE'})
        await repository.activate(task, hashApiKey('task_k'))

        assert.deepEqual(
            await tasks.authenticateApiKey('task_k'),
            {username: 'alice', taskId: task.id}
        )
    })

    test('names nobody for an unknown key', async () => {
        assert.equal(await setup().tasks.authenticateApiKey('task_unknown'), null)
    })
})

describe('resubmitting and removing', () => {
    test('a finished task is run again as a new task, and the old one removed', async () => {
        const {tasks, repository} = setup()
        const task = await tasks.submit({username: 'alice', operation: 'image.GEE', params: {title: 'Mosaic'}})
        await tasks.cancel({taskId: task.id, username: 'alice'})

        const again = await tasks.resubmit({taskId: task.id, username: 'alice'})

        assert.partialDeepStrictEqual(
            again,
            {operation: 'image.GEE', params: {title: 'Mosaic'}, state: State.PENDING}
        )
        assert.notEqual(again.id, task.id)
        assert.deepEqual((await repository.userTasks('alice')).map(({id}) => id), [again.id])
    })

    test('resubmitting a finished task twice at once runs it again only once', async () => {
        const {tasks, repository} = setup()
        const task = await tasks.submit({username: 'alice', operation: 'image.GEE'})
        await tasks.cancel({taskId: task.id, username: 'alice'})

        await Promise.all([
            tasks.resubmit({taskId: task.id, username: 'alice'}),
            tasks.resubmit({taskId: task.id, username: 'alice'})
        ])

        assert.equal((await repository.userTasks('alice')).length, 1)
    })

    test('an unfinished task can be neither resubmitted nor removed', async () => {
        const {tasks} = setup()
        const task = await tasks.submit({username: 'alice', operation: 'image.GEE'})

        await assert.rejects(tasks.resubmit({taskId: task.id, username: 'alice'}), InvalidCommand)
        await assert.rejects(tasks.remove({taskId: task.id, username: 'alice'}), InvalidCommand)
    })

    test('removing in bulk removes only the given tasks that have finished', async () => {
        const {tasks, repository} = setup()
        const running = await tasks.submit({username: 'alice', operation: 'image.GEE'})
        const finished = await tasks.submit({username: 'alice', operation: 'image.GEE'})
        const otherFinished = await tasks.submit({username: 'alice', operation: 'image.GEE'})
        await tasks.cancel({taskId: finished.id, username: 'alice'})
        await tasks.cancel({taskId: otherFinished.id, username: 'alice'})

        await tasks.removeFinished({taskIds: [running.id, finished.id], username: 'alice'})

        assert.deepEqual(
            (await repository.userTasks('alice')).map(({id}) => id),
            [running.id, otherFinished.id]
        )
    })

    test('removing in bulk requires the tasks to remove', async () => {
        await assert.rejects(setup().tasks.removeFinished({username: 'alice'}), InvalidCommand)
    })

    test('a task that does not exist is not found', async () => {
        await assert.rejects(setup().tasks.getTask({taskId: 'nope', username: 'alice'}), NotFound)
    })
})

const workspaceExport = exportOverrides => ({
    description: 'ndvi',
    export: {kind: 'IMAGE', destination: 'SEPAL', expression: EXPRESSION, ...exportOverrides}
})

const setup = () => {
    let now = 1_000_000
    const clock = {now: () => new Date(now++)}
    const repository = new InMemoryRepository(clock)
    const supervisor = {
        dispatched: 0,
        stopped: [],
        dispatch() {
            this.dispatched++
            return Promise.resolve()
        },
        slotRequests: [],
        slotReleases: [],
        stopContainer(task) {
            this.stopped.push(task.id)
            return Promise.resolve()
        },
        requestSlot(task) {
            this.slotRequests.push(task.id)
            return Promise.resolve(GRANTED)
        },
        releaseSlot(task, slot) {
            this.slotReleases.push([task.id, slot])
            return Promise.resolve()
        }
    }
    let id = 0
    const tasks = new Tasks({repository, supervisor, clock: clock.now, newId: () => `t-${++id}`})
    return {tasks, repository, supervisor}
}
