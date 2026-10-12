import {hashApiKey} from './apiKey.js'
import {InvalidCommand, NotFound, Unauthorized} from './errors.js'
import {State} from './task.js'
import {Tasks} from './tasks.js'
import {InMemoryRepository} from './testSupport/inMemoryRepository.js'

describe('submitting', () => {
    test('stores a pending task for the user and asks for it to be launched', async () => {
        const {tasks, supervisor} = setup()

        const task = await tasks.submit({username: 'alice', operation: 'image.GEE', params: {title: 'Mosaic'}, recipeId: 'r-1'})

        expect(task).toMatchObject({username: 'alice', operation: 'image.GEE', state: State.PENDING, recipeId: 'r-1'})
        expect(supervisor.dispatched).toBe(1)
    })

    test('accepts params sent as a JSON string', async () => {
        const {tasks} = setup()

        const task = await tasks.submit({username: 'alice', operation: 'image.GEE', params: JSON.stringify({title: 'Mosaic'})})

        expect(task.params).toEqual({title: 'Mosaic'})
    })

    test('refuses a task without an operation', async () => {
        await expect(setup().tasks.submit({username: 'alice', params: {}})).rejects.toThrow(InvalidCommand)
    })
})

describe('cancelling', () => {
    test('a pending task is canceled at once', async () => {
        const {tasks, repository} = setup()
        const task = await tasks.submit({username: 'alice', operation: 'image.GEE'})

        await tasks.cancel({taskId: task.id, username: 'alice'})

        expect((await repository.getTask(task.id)).state).toBe(State.CANCELED)
    })

    test('a running task is marked canceling and its container is stopped', async () => {
        const {tasks, repository, supervisor} = setup()
        const task = await tasks.submit({username: 'alice', operation: 'image.GEE'})
        await repository.activate(task, hashApiKey('task_k'))

        await tasks.cancel({taskId: task.id, username: 'alice'})

        expect((await repository.getTask(task.id)).state).toBe(State.CANCELING)
        expect(supervisor.stopped).toEqual([task.id])
    })

    test('another user\'s task cannot be cancelled', async () => {
        const {tasks} = setup()
        const task = await tasks.submit({username: 'alice', operation: 'image.GEE'})

        await expect(tasks.cancel({taskId: task.id, username: 'bob'})).rejects.toThrow(Unauthorized)
    })
})

describe('progress from a container', () => {
    test('is recorded for the task whose key sent it', async () => {
        const {tasks, repository} = setup()
        const task = await tasks.submit({username: 'alice', operation: 'image.GEE'})
        await repository.activate(task, hashApiKey('task_k'))
        const statusDescription = {messageKey: 'tasks.ee.export.running', defaultMessage: 'Exporting'}

        await tasks.reportProgress({taskId: task.id, callerTaskId: task.id, statusDescription})

        expect(JSON.parse((await repository.getTask(task.id)).statusDescription)).toEqual(statusDescription)
    })

    test('progress from a different task\'s key is refused', async () => {
        const {tasks} = setup()
        const task = await tasks.submit({username: 'alice', operation: 'image.GEE'})

        await expect(tasks.reportProgress({taskId: task.id, callerTaskId: 'other', statusDescription: {}})).rejects.toThrow(Unauthorized)
    })
})

describe('authenticating a container\'s key', () => {
    test('names the user and task of a running task\'s key', async () => {
        const {tasks, repository} = setup()
        const task = await tasks.submit({username: 'alice', operation: 'image.GEE'})
        await repository.activate(task, hashApiKey('task_k'))

        expect(await tasks.authenticateApiKey('task_k')).toEqual({username: 'alice', taskId: task.id})
    })

    test('names nobody for an unknown key', async () => {
        expect(await setup().tasks.authenticateApiKey('task_unknown')).toBeNull()
    })
})

describe('resubmitting and removing', () => {
    test('a finished task is run again as a new task, and the old one removed', async () => {
        const {tasks, repository} = setup()
        const task = await tasks.submit({username: 'alice', operation: 'image.GEE', params: {title: 'Mosaic'}})
        await tasks.cancel({taskId: task.id, username: 'alice'})

        const again = await tasks.resubmit({taskId: task.id, username: 'alice'})

        expect(again).toMatchObject({operation: 'image.GEE', params: {title: 'Mosaic'}, state: State.PENDING})
        expect(again.id).not.toBe(task.id)
        expect((await repository.userTasks('alice')).map(({id}) => id)).toEqual([again.id])
    })

    test('an unfinished task can be neither resubmitted nor removed', async () => {
        const {tasks} = setup()
        const task = await tasks.submit({username: 'alice', operation: 'image.GEE'})

        await expect(tasks.resubmit({taskId: task.id, username: 'alice'})).rejects.toThrow(InvalidCommand)
        await expect(tasks.remove({taskId: task.id, username: 'alice'})).rejects.toThrow(InvalidCommand)
    })

    test('a task that does not exist is not found', async () => {
        await expect(setup().tasks.getTask({taskId: 'nope', username: 'alice'})).rejects.toThrow(NotFound)
    })
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
        stopContainer(task) {
            this.stopped.push(task.id)
            return Promise.resolve()
        }
    }
    let id = 0
    const tasks = new Tasks({repository, supervisor, clock: clock.now, newId: () => `t-${++id}`})
    return {tasks, repository, supervisor}
}
