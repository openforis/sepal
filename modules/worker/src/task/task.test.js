// Unit tests for the Task domain (state machine + descriptions + getTitle + Timeout). No database.

import {
    activate,
    canceled,
    canceling,
    complete,
    createTask,
    fail,
    getTitle,
    isActive,
    isCanceled,
    isCanceling,
    isCompleted,
    isFailed,
    isPending,
    State,
    StateDescription,
    Timeout,
    update,
} from './task.js'

const task = overrides => createTask({
    id: 't-1',
    state: State.PENDING,
    username: 'alice',
    sessionId: 's-1',
    operation: 'some-operation',
    params: {},
    statusDescription: StateDescription.PENDING,
    creationTime: new Date('2026-01-01T00:00:00Z'),
    updateTime: new Date('2026-01-01T00:00:00Z'),
    removed: false,
    recipeId: null,
    ...overrides,
})

describe('State descriptions', () => {
    test('PENDING', () => {
        expect(JSON.parse(StateDescription.PENDING)).toEqual({
            defaultMessage: 'Initializing...', messageKey: 'tasks.status.initializing', messageArgs: {},
        })
    })
    test('ACTIVE', () => {
        expect(JSON.parse(StateDescription.ACTIVE)).toEqual({
            defaultMessage: 'Executing...', messageKey: 'tasks.status.executing', messageArgs: {},
        })
    })
    test('COMPLETED', () => {
        expect(JSON.parse(StateDescription.COMPLETED)).toEqual({
            defaultMessage: 'Completed!', messageKey: 'tasks.status.completed', messageArgs: {},
        })
    })
    test('CANCELING', () => {
        expect(JSON.parse(StateDescription.CANCELING)).toEqual({
            defaultMessage: 'Canceling.', messageKey: 'tasks.status.canceling', messageArgs: {},
        })
    })
    test('CANCELED', () => {
        expect(JSON.parse(StateDescription.CANCELED)).toEqual({
            defaultMessage: 'Canceled.', messageKey: 'tasks.status.canceled', messageArgs: {},
        })
    })
    test('FAILED carries messageArgs.error', () => {
        expect(JSON.parse(StateDescription.FAILED)).toEqual({
            defaultMessage: 'Failed: Internal Error', messageKey: 'tasks.status.failed',
            messageArgs: {error: 'Internal Error'},
        })
    })
})

describe('transitions', () => {
    test('activate → ACTIVE + ACTIVE description', () => {
        const t = activate(task())
        expect(t.state).toBe(State.ACTIVE)
        expect(t.statusDescription).toBe(StateDescription.ACTIVE)
    })
    test('complete → COMPLETED + COMPLETED description', () => {
        const t = complete(task())
        expect(t.state).toBe(State.COMPLETED)
        expect(t.statusDescription).toBe(StateDescription.COMPLETED)
    })
    test('canceling → CANCELING + CANCELING description', () => {
        const t = canceling(task())
        expect(t.state).toBe(State.CANCELING)
        expect(t.statusDescription).toBe(StateDescription.CANCELING)
    })
    test('canceled → CANCELED + CANCELED description', () => {
        const t = canceled(task())
        expect(t.state).toBe(State.CANCELED)
        expect(t.statusDescription).toBe(StateDescription.CANCELED)
    })
    test('fail() defaults to FAILED description', () => {
        const t = fail(task())
        expect(t.state).toBe(State.FAILED)
        expect(t.statusDescription).toBe(StateDescription.FAILED)
        expect(JSON.parse(t.statusDescription).messageArgs).toEqual({error: 'Internal Error'})
    })
    test('fail(desc) carries a custom error message', () => {
        const custom = JSON.stringify({defaultMessage: 'Boom', messageKey: 'tasks.status.failed', messageArgs: {error: 'Boom'}})
        const t = fail(task(), custom)
        expect(t.state).toBe(State.FAILED)
        expect(t.statusDescription).toBe(custom)
        expect(JSON.parse(t.statusDescription).messageArgs).toEqual({error: 'Boom'})
    })
    test('update(state) uses the default description when none given', () => {
        expect(update(task(), State.COMPLETED).statusDescription).toBe(StateDescription.COMPLETED)
    })
    test('update(state, desc) uses the supplied description', () => {
        const desc = JSON.stringify({defaultMessage: 'x', messageKey: 'k', messageArgs: {}})
        expect(update(task(), State.ACTIVE, desc).statusDescription).toBe(desc)
    })
    test('transitions are immutable (original unchanged)', () => {
        const t = task()
        activate(t)
        expect(t.state).toBe(State.PENDING)
    })
    test('other fields preserved across a transition', () => {
        const t = activate(task({recipeId: 'r-1', params: {foo: 'bar'}}))
        expect(t.id).toBe('t-1')
        expect(t.recipeId).toBe('r-1')
        expect(t.params).toEqual({foo: 'bar'})
        expect(t.sessionId).toBe('s-1')
    })
})

describe('predicates', () => {
    test('one predicate true per state', () => {
        expect(isPending(task({state: State.PENDING}))).toBe(true)
        expect(isActive(task({state: State.ACTIVE}))).toBe(true)
        expect(isCompleted(task({state: State.COMPLETED}))).toBe(true)
        expect(isCanceling(task({state: State.CANCELING}))).toBe(true)
        expect(isCanceled(task({state: State.CANCELED}))).toBe(true)
        expect(isFailed(task({state: State.FAILED}))).toBe(true)
    })
    test('predicates are mutually exclusive', () => {
        const t = task({state: State.ACTIVE})
        expect(isPending(t)).toBe(false)
        expect(isCompleted(t)).toBe(false)
        expect(isFailed(t)).toBe(false)
    })
})

describe('getTitle', () => {
    test('landsat-scene-download → scene count', () => {
        const t = task({operation: 'landsat-scene-download', params: {sceneIds: ['a', 'b', 'c']}})
        expect(getTitle(t)).toBe('Retrieving 3 Landsat scenes')
    })
    test('default → params.title when present', () => {
        expect(getTitle(task({operation: 'foo', params: {title: 'My Title'}}))).toBe('My Title')
    })
    test('default → operation when no title', () => {
        expect(getTitle(task({operation: 'foo', params: {}}))).toBe('foo')
    })
})

describe('Timeout', () => {
    const MINUTE = 60 * 1000
    test('timeout durations: PENDING 10m, ACTIVE 5m, CANCELING 2m', () => {
        expect(Timeout.PENDING.timeoutInMillis).toBe(10 * MINUTE)
        expect(Timeout.ACTIVE.timeoutInMillis).toBe(5 * MINUTE)
        expect(Timeout.CANCELING.timeoutInMillis).toBe(2 * MINUTE)
    })
    test('lastValidUpdate(now) = now − timeout', () => {
        const now = new Date('2026-06-01T12:00:00Z')
        expect(Timeout.PENDING.lastValidUpdate(now).getTime()).toBe(now.getTime() - 10 * MINUTE)
        expect(Timeout.ACTIVE.lastValidUpdate(now).getTime()).toBe(now.getTime() - 5 * MINUTE)
        expect(Timeout.CANCELING.lastValidUpdate(now).getTime()).toBe(now.getTime() - 2 * MINUTE)
    })
})
