// Unit tests for the task-changed event decorator. No database — hand-rolled fake repo.

import {EventEmittingTaskRepository, taskChanged$} from './events.js'

const task = {id: 't-1', username: 'alice', state: 'PENDING'}

const collectEvents = () => {
    const events = []
    const subscription = taskChanged$.subscribe(event => events.push(event))
    return {events, stop: () => subscription.unsubscribe()}
}

describe('EventEmittingTaskRepository', () => {
    it('emits {username} after insert resolves', async () => {
        const {events, stop} = collectEvents()
        const repo = new EventEmittingTaskRepository({insert: async () => 'inserted'})
        const result = await repo.insert(task)
        stop()
        expect(result).toBe('inserted')
        expect(events).toEqual([{username: 'alice'}])
    })

    it('emits {username} after update and remove resolve', async () => {
        const {events, stop} = collectEvents()
        const repo = new EventEmittingTaskRepository({
            update: async () => null,
            remove: async () => null,
        })
        await repo.update(task)
        await repo.remove(task)
        stop()
        expect(events).toEqual([{username: 'alice'}, {username: 'alice'}])
    })

    it('emits {username} after removeNonPendingOrActiveUserTasks resolves', async () => {
        const {events, stop} = collectEvents()
        const repo = new EventEmittingTaskRepository({removeNonPendingOrActiveUserTasks: async () => null})
        await repo.removeNonPendingOrActiveUserTasks('bob')
        stop()
        expect(events).toEqual([{username: 'bob'}])
    })

    it('does not emit when the underlying mutation rejects', async () => {
        const {events, stop} = collectEvents()
        const repo = new EventEmittingTaskRepository({
            update: async () => {
                throw new Error('boom')
            },
        })
        await expect(repo.update(task)).rejects.toThrow('boom')
        stop()
        expect(events).toEqual([])
    })

    it('forwards query methods to the repo', async () => {
        const repo = new EventEmittingTaskRepository({getTask: async taskId => ({...task, id: taskId})})

        const found = await repo.getTask('t-2')

        expect(found).toEqual({...task, id: 't-2'})
    })
})
