import assert from 'node:assert/strict'
import {test} from 'node:test'

import {createTask, getTitle, isFinished, State, StateDescription} from './task.js'

test('a task is finished once completed, canceled or failed', () => {
    assert.deepEqual(
        [State.PENDING, State.ACTIVE, State.CANCELING].map(state => isFinished(aTask({state}))),
        [false, false, false]
    )
    assert.deepEqual(
        [State.COMPLETED, State.CANCELED, State.FAILED].map(state => isFinished(aTask({state}))),
        [true, true, true]
    )
})

test('a new task describes itself by its state until told otherwise', () => {
    assert.equal(aTask().statusDescription, StateDescription.PENDING)
})

test('a task is titled by its params, or else by its operation', () => {
    assert.equal(getTitle(aTask()), 'Mosaic')
    assert.equal(getTitle(aTask({params: {}})), 'image.GEE')
})

const aTask = overrides => createTask({id: 't-1', state: State.PENDING, username: 'alice', operation: 'image.GEE', params: {title: 'Mosaic'}, ...overrides})
