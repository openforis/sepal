// Unit tests for the task-changed event decorator. No database — hand-rolled fake repo.

import {taskChanged$, withTaskChangedEvents} from './events.js'

const task = {id: 't-1', username: 'alice', state: 'PENDING'}

const collectEvents = () => {
    const events = []
    const subscription = taskChanged$.subscribe(event => events.push(event))
    return {events, stop: () => subscription.unsubscribe()}
}

describe('withTaskChangedEvents', () => {
    it('emits {username} after insert resolves', async () => {
        const {events, stop} = collectEvents()
        const repo = withTaskChangedEvents({insert: async () => 'inserted'})
        const result = await repo.insert(task)
        stop()
        expect(result).toBe('inserted')
        expect(events).toEqual([{username: 'alice'}])
    })

    it('emits {username} after update and remove resolve', async () => {
        const {events, stop} = collectEvents()
        const repo = withTaskChangedEvents({
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
        const repo = withTaskChangedEvents({removeNonPendingOrActiveUserTasks: async () => null})
        await repo.removeNonPendingOrActiveUserTasks('bob')
        stop()
        expect(events).toEqual([{username: 'bob'}])
    })

    it('does not emit when the underlying mutation rejects', async () => {
        const {events, stop} = collectEvents()
        const repo = withTaskChangedEvents({
            update: async () => {
                throw new Error('boom')
            },
        })
        await expect(repo.update(task)).rejects.toThrow('boom')
        stop()
        expect(events).toEqual([])
    })

    it('passes query methods through untouched', async () => {
        const getTask = async () => task
        const repo = withTaskChangedEvents({getTask, insert: async () => null})
        expect(repo.getTask).toBe(getTask)
    })
})
