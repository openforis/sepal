import {createTask, getTitle, isFinished, State, StateDescription} from './task.js'

test('a task is finished once completed, canceled or failed', () => {
    expect([State.PENDING, State.ACTIVE, State.CANCELING].map(state => isFinished(aTask({state})))).toEqual([false, false, false])
    expect([State.COMPLETED, State.CANCELED, State.FAILED].map(state => isFinished(aTask({state})))).toEqual([true, true, true])
})

test('a new task describes itself by its state until told otherwise', () => {
    expect(aTask().statusDescription).toBe(StateDescription.PENDING)
})

test('a task is titled by its params, or else by its operation', () => {
    expect(getTitle(aTask())).toBe('Mosaic')
    expect(getTitle(aTask({params: {}}))).toBe('image.GEE')
})

const aTask = overrides => createTask({id: 't-1', state: State.PENDING, username: 'alice', operation: 'image.GEE', params: {title: 'Mosaic'}, ...overrides})
